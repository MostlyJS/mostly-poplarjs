import { EventEmitter } from 'events';
import _ from 'lodash';
import util from 'util';
import assert from 'assert';
import makeDebug from 'debug';
import { Dynamic } from 'mostly-entity';

import { escapeRegex } from './helper';

var debug = makeDebug('mostly:poplarjs:context');

/**
 * Create a new `Context` with the given `options`.
 *
 * @param {Object} options
 * @return {Context}
 * @class
 */
export default class Context extends EventEmitter {

  constructor(req, method, options) {
    super();

    this.req = req;
    this.method = method;
    this.options = options || {};
    this.args = this.buildArgs(method);
    this.methodName = method.name;

    //req.context = this;
  }

  /**
   * Build args object from the context.
   */
  buildArgs(method) {
    var args = {};
    var ctx = this;
    var accepts = method.accepts;

    // build arguments from req and method options
    for (var i = 0, n = accepts.length; i < n; i++) {
      var o = accepts[i];
      var httpFormat = o.http;
      var name = o.name || o.arg;
      var val;

      // Support array types, such as ['string']
      var isArrayType = Array.isArray(o.type);
      var otype = isArrayType ? o.type[0] : o.type;
      otype = (typeof otype === 'string') && otype.toLowerCase();
      var isAny = !otype || otype === 'any';

      // This is an http method keyword, which requires special parsing.
      if (httpFormat) {
        switch (typeof httpFormat) {
          case 'function':
            // the options have defined a formatter
            val = httpFormat(ctx);
            break;
          case 'object':
            switch (httpFormat.source) {
              case 'body':
                val = ctx.req.body;
                break;
              case 'form':
                // From the form (body)
                val = ctx.req.body && ctx.req.body[name];
                break;
              case 'query':
                // From the query string
                val = ctx.req.query[name];
                break;
              case 'path':
                // From the url path
                val = ctx.req.params[name];
                break;
              case 'header':
                val = ctx.req.get(name);
                break;
            }
            break;
        }
      } else {
        val = ctx.getArgByName(name, o);
        // Safe to coerce the contents of this
        if (typeof val === 'object' && (!isArrayType || isAny)) {
          val = coerceAll(val);
        }
      }

      // If we expect an array type and we received a string, parse it with JSON.
      // If that fails, parse it with the arrayItemDelimiters option.
      if (val && typeof val === 'string' && isArrayType) {
        var parsed = false;
        if (val[0] === '[') {
          try {
            val = JSON.parse(val);
            parsed = true;
          } catch (e) {
            debug('Faild to parse json', val);
          }
        }
        if (!parsed && ctx.options.arrayItemDelimiters) {
          // Construct delimiter regex if input was an array. Overwrite option
          // so this only needs to happen once.
          var delims = this.options.arrayItemDelimiters;
          if (Array.isArray(delims)) {
            delims = new RegExp(_.map(delims, escapeRegex).join('|'), 'g');
            this.options.arrayItemDelimiters = delims;
          }

          val = val.split(delims);
        }
      }

      // Coerce dynamic args when input is a string.
      if (isAny && typeof val === 'string') {
        val = coerceAll(val);
      }

      // If the input is not an array, but we were expecting one, create
      // an array. Create an empty array if input is empty.
      if (!Array.isArray(val) && isArrayType) {
        if (val !== undefined && val !== '') val = [val];
        else val = [];
      }

      // For boolean and number types, convert certain strings to that type.
      // The user can also define new dynamic types.
      if (Dynamic.canConvert(otype)) {
        val = dynamic(val, otype, ctx);
      }

      if (o.hasOwnProperty('default')) {
        val = (val !== undefined && val !== null) ? val : o.default;
      }

      // set the argument value
      args[o.arg] = val;
    }

    return args;
  }

  /**
   * Get an arg by name using the given options.
   *
   * @param {String} name
   * @param {Object} options **optional**
   */
  getArgByName(name, options) {
    var req = this.req;
    var args = req.params && req.params.args !== undefined ? req.params.args :
               req.body && req.body.args !== undefined ? req.body.args :
               req.query && req.query.args !== undefined ? req.query.args :
               undefined;

    if (args) {
      args = JSON.parse(args);
    }

    if (typeof args !== 'object' || !args) {
      args = {};
    }

    var arg = (args && args[name] !== undefined) ? args[name] :
              this.req.params[name] !== undefined ? this.req.params[name] :
              (this.req.body && this.req.body[name]) !== undefined ? this.req.body[name] :
              this.req.query[name] !== undefined ? this.req.query[name] :
              undefined;
    // search these in order by name
    // req.params
    // req.body
    // req.query
    // req.header

    return arg;
  }

}

/*!
 * Integer test regexp.
 */
var isint = /^[0-9]+$/;

/*!
 * Float test regexp.
 */
var isfloat = /^([0-9]+)?\.[0-9]+$/;

// Use dynamic to coerce a value or array of values.
function dynamic(val, toType, ctx) {
  if (Array.isArray(val)) {
    return _.map(val, function(v) {
      return dynamic(v, toType, ctx);
    });
  }
  return (new Dynamic(val, ctx)).to(toType);
}

function coerce(str) {
  if (typeof str !== 'string') return str;
  if ('null' === str) return null;
  if ('true' === str) return true;
  if ('false' === str) return false;
  if (isfloat.test(str)) return parseFloat(str, 10);
  if (isint.test(str) && str.charAt(0) !== '0') return parseInt(str, 10);
  return str;
}

// coerce every string in the given object / array
function coerceAll(obj) {
  var type = Array.isArray(obj) ? 'array' : typeof obj;
  var i;
  var n;

  switch (type) {
    case 'string':
      return coerce(obj);
    case 'object':
      if (obj) {
        var props = Object.keys(obj);
        for (i = 0, n = props.length; i < n; i++) {
          var key = props[i];
          obj[key] = coerceAll(obj[key]);
        }
      }
      break;
    case 'array':
      for (i = 0, n = obj.length; i < n; i++) {
        coerceAll(obj[i]);
      }
      break;
  }

  return obj;
}




