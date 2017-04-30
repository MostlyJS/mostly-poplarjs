import makeDebug from 'debug';
import { EventEmitter } from 'events';
import util from 'util';
import assert from 'assert';
import _ from 'lodash';
import Path from 'path';

import Poplar from './poplar';
import Context from './context';
import { pathMatch } from './helper';

const debug = makeDebug('mostly:poplarjs:adapter');

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
              debug('service called result %j', ctx.result);
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
        var [re, match] = pathMatch(route.path);
        adapter.poplar.trans.add({
          topic: `poplar.${route.fullName}`,
          cmd: `${route.verb}`,
          path: re
        }, function (req, cb) {
          req.params = match(req.path);
          debug(`service called ${req.topic}->${req.cmd} with ${req.path},
          => headers: %j
          => query: %j
          => params: %j
          => body: %j`, req.headers, req.query, req.params, req.body);
          route.handler(req, cb);
        });
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
