/**
 * Module dependencies.
 */
var debug = require('debug')('mostly:poplarjs:rest-adapter');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var inherits = util.inherits;
var assert = require('assert');
var async = require('async');
var _ = require('lodash');
var Path = require('path');
var Poplar = require('./poplar');

/**
 * Create a dynamic value from the given value.
 *
 * @param {*} val The value object
 * @param {Context} ctx The Context
 */
export default class Adapter extends EventEmitter {

  constructor(api, options) {
    super();
    this.api = api;
    assert(api instanceof Poplar, util.format('%s must be a Poplar instance', api));
    this.options = _.extend({}, (api.options || {}).rest, options);
    this._routes = [];
  }

  /**
   * Create a Rest Handler based on Poplar Api instance
   */
  createHandler() {
    var adapter = this;
    var methods = this.api.allMethods();

    function createRoutes() {
      _.each(methods, function(method) {
        adapter._routes.push({
          verb: (method.http.verb || 'all').toLowerCase(),
          path: Path.join('/', adapter.api.basePath, method.fullPath()),
          fullName: method.fullName(),
          description: method.description,
          handler: function(req, res, next) {
            var methodInvocation = method.createMethodInvocation();
            var ctx = new HttpContext(req, res, methodInvocation, adapter.options);
            adapter.invokeMethod(ctx, methodInvocation, next);
          }
        });
      });
    }

    function applyRoutes() {
      _.each(adapter._routes, function(route) {
        debug('applyRoutes', route);
        //assert(router[route.verb], util.format('Method `%s` contains invalid http verb: %s', route.fullName, route.verb));
        //router[route.verb](route.path, route.handler);
      });
    }

    createRoutes();
    applyRoutes();

    this.debugAllRoutes();
  }

  /**
   * return All Routes
   */
  allRoutes() {
    return this._routes || [];
  }

  /**
   * debug all routes as human readable
   */
  debugAllRoutes() {
    var infos = [];
    infos.push('ALL ROUTERS:');
    _.each(this.allRoutes(), function(route) {
      var str = route.fullName;
      str = [_.padEnd(str, 25), route.verb.toUpperCase()].join(' ');
      str = [_.padEnd(str, 36), route.path].join(' ');
      infos.push(util.format('  %s:', route.description || ''));
      infos.push(util.format('  ==>  %s', str));
    });
    var longestSentence = _.max(infos, function(sentence) {
      return (sentence || '').length;
    });
    var padEnd = longestSentence.length + 4;
    _.each(infos, function(sentence) {
      debug(_.padEnd(sentence, padEnd));
    });
  }

  /**
   * invode method with specific context and callbacks
   */
  invokeMethod(ctx, method, next) {
    var api = this.api;

    async.series(
      [api.invokeMethodInContext.bind(this.api, method, ctx)],
      function(err) {
        if (err) return next(err);
        ctx.done();
        // Do not call next middleware, the request is handled
      }
    );
  }

}
