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

  constructor (app, options) {
    super();

    this._application = app;
    assert(app instanceof Poplar, util.format('%s must be a Poplar instance', app));
    this.options = _.extend({}, (app.options || {}).rest, options);
    this._routes = [];
  }

  /**
   * Create a Rest Handler based on Poplar Api instance
   */
  createHandler () {
    var adapter = this;
    var methods = this._application.allMethods();

    function createRoutes () {
      _.each(methods, function (method) {
        adapter._routes.push({
          verb: (method.http.verb || 'all').toLowerCase(),
          path: Path.join('/', adapter._application.basePath, method.fullPath()),
          version: method.version || '*',
          fullName: method.fullName(),
          description: method.description,
          handler: function (req, next) {
            var methodInvocation = method.createMethodInvocation();
            var ctx = new Context(req, methodInvocation, adapter.options);
            adapter._application.invokeMethodInContext(methodInvocation, ctx, function(err) {
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
        const [re, service, match] = pathMatch(route.path);
        adapter._application.trans.add({
          topic: `poplar.${service}`,
          cmd: route.verb,
          path: re,
          version: route.version
        }, function (req, cb) {
          req.params = match(req.path);
          debug(`service ${service} called`);
          debug(` => topic \'${req.topic}\'`);
          debug(` => cmd \'${req.cmd}\'`);
          debug(` => path \'${req.path}\'`);
          debug(` => version \'${req.version}\'`);
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
  allRoutes () {
    return this._routes || [];
  }

  /**
   * debug all routes as human readable
   */
  debugAllRoutes () {
    var infos = [];
    infos.push('ALL SERVICES / ROUTERS:');
    _.each(this.allRoutes(), function (route) {
      var [re, service, match] = pathMatch(route.path);
      var str = service;
      str = [_.padEnd(str, 20), route.version].join(' ');
      str = [_.padEnd(str, 25), route.verb.toUpperCase()].join(' ');
      str = [_.padEnd(str, 30), route.path].join(' ');
      infos.push(util.format(' %s:', route.description || ''));
      infos.push(util.format(' => %s', str));
    });
    var longestSentence = _.max(infos, function (sentence) {
      return (sentence || '').length;
    });
    var padEnd = longestSentence.length + 4;
    _.each(infos, function (sentence) {
      debug(_.padEnd(sentence, padEnd));
    });
  }

}
