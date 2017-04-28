/**
 * Module dependencies.
 */
var debug = require('debug')('mostly:poplarjs:adapter');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var inherits = util.inherits;
var assert = require('assert');
var async = require('async');
var _ = require('lodash');
var Path = require('path');
var pathToRegexp = require('path-to-regexp');
var Poplar = require('./poplar');
var Context = require('./context');
var helper = require('./helper');

/**
 * Create a dynamic value from the given value.
 *
 * @param {*} val The value object
 * @param {Context} ctx The Context
 */
export default class Adapter extends EventEmitter {

  constructor(poplar, options) {
    super();
    this.poplar = poplar;
    assert(poplar instanceof Poplar, util.format('%s must be a Poplar instance', poplar));
    this.options = _.extend({}, (poplar.options || {}).rest, options);
    this._routes = [];
  }

  /**
   * Create a Rest Handler based on Poplar Api instance
   */
  createHandler() {
    var adapter = this;
    var methods = this.poplar.allMethods();

    function createRoutes() {
      _.each(methods, function(method) {
        adapter._routes.push({
          verb: (method.http.verb || 'all').toLowerCase(),
          path: Path.join('/', adapter.poplar.basePath, method.fullPath()),
          fullName: method.fullName(),
          description: method.description,
          handler: function(req, next) {
            var methodInvocation = method.createMethodInvocation();
            var ctx = new Context(req, methodInvocation, adapter.options);
            adapter.poplar.invokeMethodInContext(method, ctx, function(err) {
              if (err) return next(err);
              next(null, ctx.result);
            });
          }
        });
      });
    }

    // Register the service
    function applyRoutes() {
      _.each(adapter._routes, function(route) {
        debug('applyRoutes', route);
        var [re, match] = helper.pathMatch(route.path);
        adapter.poplar.trans.add({
          topic: `poplar.${route.fullName}`,
          cmd: `${route.verb}`,
          path: re
        }, function (req, cb) {
          var params = match(req.path);
          debug(`service called ${req.topic}->${req.cmd} with ${req.path},  %j
            => headers: %j
            => query: %j
            => body: %j`, params, req.headers, req.query, req.body);
          route.handler(req, cb);
        });
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

}
