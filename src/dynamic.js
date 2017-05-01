
/*!
 * Module dependencies.
 */
import makeDebug from 'debug';
import _ from 'lodash';
import assert from 'assert';

const debug = makeDebug('mostly:poplarjs:dynamic');

/**
 * @class
 * Create a dynamic value from the given value.
 *
 * @param {*} val The value object
 * @param {Context} ctx The Context
 */
export default class Dynamic {
  constructor(val, ctx) {
    this.val = val;
    this.ctx = ctx;
  }

  /**
   * Define a named type conversion. The conversion is used when a
   * `ApiMethod` argument defines a type with the given `name`.
   *
   * ```js
   * Dynamic.define('MyType', function(val, ctx) {
   *   // use the val and ctx objects to return the concrete value
   *   return new MyType(val);
   * });
   * ```
   *
   * @param {String} name The type name
   * @param {Function} converter
   */
  static define(name, converter) {
    Dynamic.converters[name] = converter;
  }

  /**
   * undefine a converter via its name
   */
  static undefine(name) {
    delete Dynamic.converters[name];
  }

  /**
   * Is the given type supported.
   *
   * @param {String} type
   * @returns {Boolean}
   */
  static canConvert(type) {
    return !!Dynamic.getConverter(type);
  }

  /**
   * Get converter by type name.
   *
   * @param {String} type
   * @returns {Function}
   */
  static getConverter(type) {
    return Dynamic.converters[type];
  }

  /**
   * Shortcut method for convert value
   *
   * @param {String} val
   * @param {String} type
   * @param {Object} ctx
   * @returns {Object}
   */
  static convert(val, toType, ctx) {
    if (Array.isArray(toType)) {
      if (!Array.isArray(val)) {
        if (val === undefined || val === '') {
          val = [];
        } else {
          val = [val];
        }
      }

      return Dynamic.convert(val, toType[0], ctx);
    }

    if (Array.isArray(val)) {
      return _.map(val, function(v) {
        return Dynamic.convert(v, toType, ctx);
      });
    }
    return (new Dynamic(val, ctx)).to(toType);
  }

  /**
   * Convert the dynamic value to the given type.
   *
   * @param {String} type
   * @returns {*} The concrete value
   */
  to(type) {
    var converter = Dynamic.getConverter(type);
    assert(converter, 'No Type converter defined for ' + type);
    return converter(this.val, this.ctx);
  }

  
}

/**
 * Built in type converters...
 *   number
 *   date
 *   string
 *   boolean
 *   any
 */
Dynamic.converters = {};

Dynamic.define('number', function convertNumber(val) {
  if (val === 0) return val;
  if (!val) return val;
  return Number(val);
});

Dynamic.define('date', function convertDate(val) {
  if (val instanceof Date) return val;
  if (!val) return val;
  return new Date(val);
});

Dynamic.define('string', function convertString(val) {
  if (typeof val === 'string') return val;
  if (!val) return val;
  return String(val);
});

Dynamic.define('boolean', function convertBoolean(val) {
  switch (typeof val) {
    case 'string':
      switch (val) {
        case 'false':
        case 'undefined':
        case 'null':
        case '0':
        case '':
          return false;
        default:
          return true;
      }
    case 'number':
      return val !== 0;
    default:
      return Boolean(val);
  }
});

Dynamic.define('any', function convertAny(val) {
  return val;
});

console.log(Dynamic.converters);