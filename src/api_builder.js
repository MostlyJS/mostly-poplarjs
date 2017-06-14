import { EventEmitter } from 'events';
import makeDebug from 'debug';
import util from 'util';
import assert from 'assert';
import _ from 'lodash';

import ApiMethod from './api_method';

const debug = makeDebug('mostly:poplarjs:api-builder');

/**
 * @class A wrapper to build apis.
 */
export default class ApiBuilder extends EventEmitter {

  constructor(name, options) {
    // call super
    super();

    // Avoid warning: possible EventEmitter memory leak detected
    this.setMaxListeners(16);

    if (name) {
      assert(_.isString(name) && /^[a-zA-Z0-9_]+$/g.test(name), util.format('\'%s\' is not a valid name, name must be a string, \'a-z\', \'A-Z\' and _ are allowed' , name));
    }
    this.name = name || '';

    this._methods = {};

    this._application = null;

    // Options:
    //   basePath: '/'
    this.options = options || {};
    assert(_.isPlainObject(this.options), util.format('Invalid options for ApiBuilder \'%s\'', this.name));

    this.options.basePath = this.options.basePath || this.name;
  }

  /**
   * Define ApiMethod
   *
   * @param {String} name: method name
   * @param {Object} options: method options
   * @param {Function} fn: method function
   */
  define(name, options, fn) {
    var self = this;

    if (name instanceof ApiMethod) {
      checkMethodExistance(name.name);
      name.setApiBuilder(this);
      // if name is a ApiMethod instance, then add it directly
      this._methods[name.name] = name;
    } else {
      checkMethodExistance(name);
      // create a new ApiMethod
      var method = new ApiMethod(name, options, fn);
      method.setApiBuilder(this);
      this._methods[name] = method;
    }

    function checkMethodExistance(methodName) {
      if (self._methods[methodName]) {
        debug('Method \'%s\' in ApiBuilder \'%s\' has been overwrited', methodName, self.name);
      }
    }
  }

  /**
   * Prepend ApiMethod before a specific apiMethod
   *
   * @param {String} prependingName: method name about to be prepending
   * @param {String} prependedName: method name about to be prepended
   **/
  prepend(prependingName, prependedName) {
    assert(this.exists(prependingName), 'Method is about to be prepending is not exists');
    assert(this.exists(prependedName), 'Method is about to be prepended is not exists');

    var prependingMethod = this.method(prependingName);
    this.undefine(prependingMethod);

    var methods = {};
    _.each(this._methods, function(method, name) {
      if (prependedName === name) {
        methods[prependingName] = prependingMethod;
      }
      methods[name] = method;
    });

    // overwrite _methods with new orders
    this._methods = methods;
  }

  /**
   * Extend an ApiBuilder
   *
   * @param {String} name: method name
   * @param {Object} options: method options
   * @param {Function} fn: method function
   */
  extend(builder) {
    assert(builder instanceof ApiBuilder, util.format('%s is not a valid ApiBuilder', builder));

    this.name = builder.name;

    this.options = _.clone(builder.options);

    var methods = builder.methods();
    var events = builder._events;
    var self = this;

    // loop and define all apiBuilder's methods
    _.each(methods, function(method) {
      var newMethod = method.clone();
      self.define(newMethod);
    });

    // loop and add all ApiBuilder listeners
    _.each(events, function(fns, type) {
      if (Array.isArray(fns)) {
        _.each(fns, function(fn) {
          if (_.isFunction(fn)) {
            self.on(type, fn);
          }
        });
      } else if (_.isFunction(fns)) {
        self.on(type, fns);
      }
    });
  }

  act(method, options, cb) {
    let prefix = options.prefix || 'poplar';
    debug('apiBuilder.act', `${prefix}.${this.name}.${method}`);
    this._application.trans.act({
      topic: `${prefix}.${this.name}.${method}`,
      cmd: options.verb || 'all',
      path: `/${options.path || ''}`,
      headers: options.headers || {},
      query: options.query || {},
      body: options.body || {}
    }, cb);
  }

  /**
   * set Application
   */
  setApplication(app) {
    this._application = app;
  }

  /**
   * Get method by name
   *
   * @param {String} name: method name
   */
  method(name) {
    return this._methods[name];
  }

  /**
   * check if a method exists
   *
   * @param {String} name: method name
   */
  exists(name) {
    return !!this.method(name);
  }

  /**
   * undefine method by name
   *
   * @param {String} name: method name
   */
  undefine(name) {
    delete this._methods[name];
  }

  /**
   * Get all methods
   */
  methods() {
    return this._methods || {};
  }

  /**
   * Remove existing hooks
   */
  removeHooks = function(hook, ...events) {
    events.forEach(event => {
      var eventName = util.format('%s.%s.%s', hook, this.name, event);
      debug('Remove hook', eventName);
      this.removeAllListeners(eventName);
    });
  }

}

/*!
 * Build hook fn
 */
function addHookFn(proto, name) {
  proto[name] = function() {
    var args = [].splice.call(arguments, 0);

    var fn = args.splice(args.length - 1)[0];
    fn = _.isFunction(fn) ? fn : undefined;

    var options = {};
    if (_.isPlainObject(args[args.length - 1])) {
      options = args.splice(args.length - 1)[0];
    }

    var self = this;
    _.each(args, function(arg) {
      var event = util.format('%s.%s.%s', name, self.name, arg);
      // remove old listeners if redefine is true
      if (options.redefine) {
        debug('Redefine hook', event);
        self.removeAllListeners(event);
      }
      self.on(event, fn);
    });
  };
}

/**
 * Execute the given function before the matched method string.
 *
 * **Examples:**
 *
 * ```js
 * // Do something before our `user.greet` example, earlier.
 * api.before('user.greet', function(ctx, next) {
 *   if ((ctx.req.param('password') || '').toString() !== '1234') {
 *     next(new Error('Bad password!'));
 *   } else {
 *     next();
 *   }
 * });
 *
 * // Do something before any `user` method.
 * api.before('user.*', function(ctx, next) {
 *   console.log('Calling a user method.');
 *   next();
 * });
 *
 * // Do something before a `dog` instance method.
 * api.before('dog.*', function(ctx, next) {
 *   var dog = this;
 *   console.log('Calling a method on "%s".', dog.name);
 *   next();
 * });
 * ```
 *
 * @param {String} methodMatch The glob to match a method string
 * @options {Object} options
 * @callback {Function} hook
 * @param {Context} ctx The adapter specific context
 * @param {Function} next Call with an optional error object
 * @param {ApiMethod} method The ApiMethod object
 */
addHookFn(ApiBuilder.prototype, 'before');

/**
 * Execute the given `hook` function after the matched method string.
 *
 * **Examples:**
 *
 * ```js
 * // Do something after the `speak` instance method.
 * // NOTE: you cannot cancel a method after it has been called.
 * api.after('dog.speak', function(ctx, next) {
 *   console.log('After speak!');
 *   next();
 * });
 *
 * // Do something before all methods.
 * api.before('**', function(ctx, next, method) {
 *   console.log('Calling:', method.name);
 *   next();
 * });
 *
 * // Modify all returned values named `result`.
 * api.after('**', function(ctx, next) {
 *   ctx.result += '!!!';
 *   next();
 * });
 * ```
 *
 * @param {String} methodMatch The glob to match a method string
 * @options {Object} options
 * @callback {Function} hook
 * @param {Context} ctx The adapter specific context
 * @param {Function} next Call with an optional error object
 * @param {ApiMethod} method The ApiMethod object
 */
addHookFn(ApiBuilder.prototype, 'after');

/**
 * Execute the given `hook` function after the method matched by the method
 * string failed.
 *
 * **Examples:**
 *
 * ```js
 * // Do something after the `speak` instance method failed.
 * api.afterError('dog.speak', function(ctx, next) {
 *   console.log('Cannot speak!', ctx.error);
 *   next();
 * });
 *
 * // Do something before all methods.
 * api.afterError('**', function(ctx, next, method) {
 *   console.log('Failed', method.name, ctx.error);
 *   next();
 * });
 *
 * // Modify all returned errors
 * api.after('**', function(ctx, next) {
 *   if (!ctx.error.details) ctx.result.details = {};
 *   ctx.error.details.info = 'intercepted by a hook';
 *   next();
 * });
 *
 * // Report a different error
 * api.after('dog.speak', function(ctx, next) {
 *   console.error(ctx.error);
 *   next(new Error('See server console log for details.'));
 * });
 * ```
 *
 * @param {String} methodMatch The glob to match a method string
 * @options {Object} options
 * @callback {Function} hook
 * @param {Context} ctx The adapter specific context
 * @param {Function} next Call with an optional error object
 * @param {ApiMethod} method The ApiMethod object
 */
addHookFn(ApiBuilder.prototype, 'afterError');

