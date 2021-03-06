const { EventEmitter } = require('events');
const util = require('util');
const assert = require('assert');
const _ = require('lodash');
const micromatch = require('micromatch');
const makeDebug = require('debug');
const { Dynamic } = require('mostly-entity');

const Adapter = require('./adapter');
const ApiBuilder = require('./api_builder');

const debug = makeDebug('mostly:poplarjs:poplar');

/**
 * Poplar constructor
 * @class
 * @param {Object} options Poplar options object
 */
class Poplar extends EventEmitter {
  /**
   * Simplified API for creating Poplar instance, equals to `new Poplar(options)`
   * @param {Object} trans Nats transport
   * @param {Object} options Poplar options
   * @return {Poplar} Poplar instance
   */
  static create (trans, options) {
    return new Poplar(trans, options);
  }

  constructor (trans, options) {
    super();

    // Avoid warning: possible EventEmitter memory leak detected
    this.setMaxListeners(16);

    this.trans = trans;
    this.options = options || {};
    this._apiBuilders = {};
    this._methods = {};
    this._listenerTree = {};
    this.setBasePath(this.options.basePath || '/');
  }

  /**
   * Set bathPath for All Apis
   */
  setBasePath (basePath) {
    assert(_.isString(basePath) && /^[a-zA-Z0-9_\/\.\-]+$/g.test(basePath), util.format('\'%s\' is not a valid basePath, basePath must be a string, \'a-z\', \'A-Z\', _, - and . are allowed' , basePath));
    this.basePath = basePath;
  }

  /**
   * Get all methods
   */
  allMethods () {
    return _.values(this._methods) || [];
  }

  /**
   * Use a ApiBuilder
   */
  use (name, options) {
    var apiBuilder = name;

    if (!(apiBuilder instanceof ApiBuilder)) {
      apiBuilder = new ApiBuilder(name, options);
    }

    apiBuilder.setApplication(this);

    name = apiBuilder.name + '.' + apiBuilder.version;
    var self = this;

    // look up apiBuilder for the collection.
    if (!this._apiBuilders[name]) {
      if (apiBuilder) {
        // cache it so we only apply apiBuilders once
        this._apiBuilders[name] = apiBuilder;
        mergeListeners(apiBuilder);
        mergeMethods(apiBuilder);
      }
    } else {
      assert(false, util.format('Can\'t use the same ApiBuilder: %s more than once!', name));
    }

    // look up all ApiBuilder listeners then add it to api
    function mergeListeners(emitter) {
      var events = emitter._events;
      _.each(events, function (fns, type) {
        if (Array.isArray(fns)) {
          _.each(fns, function (fn) {
            if (_.isFunction(fn)) {
              self.on(type, fn);
            }
          });
        } else if (_.isFunction(fns)) {
          self.on(type, fns);
        }
      });
    }

    // look up all ApiBuilder methods then add it to api
    function mergeMethods(builder) {
      var methods = builder.methods();
      _.each(methods, function (fn, methodName) {
        // e.g.: users.getUserInfo
        self._methods[util.format('%s.%s', name, methodName)] = fn;
      });
    }

    // Analyze all listeners and parse them as tree
    this.analyzeListenerTree();

    return self;
  }

  /**
   * Create a handler from the given adapter.
   *
   * @param {String} name Adapter name
   * @param {Object} options Adapter options
   * @return {Function}
   */
  handler (name, options) {
    var adapter = new Adapter(this, options);

    // create a handler from Adapter
    var handler = adapter.createHandler();

    if (handler) {
      // allow adapter reference from handler
      handler.adapter = adapter;
    }

    return handler;
  }

  /**
   * Define a named type conversion. The conversion is used when a
   * `ApiMethod` argument defines a type with the given `name`.
   *
   * ```js
   * Poplar.defineType('MyType', function (val, ctx) {
   *   // use the val and ctx objects to return the concrete value
   *   return new MyType(val);
   * });
   * ```
   *
   * @param {String} name The type name
   * @param {Function} converter Converter function
   */
  static defineType(name, fn) {
    Dynamic.define(name, fn);
  }

  /*!
   * Execute Hooks by type and method.
   */
  execHooks (when, method, ctx, next) {
    var methodName = method.fullName();

    var stack = [];

    var listenerNames = this.searchListenerTree(methodName, when) || [];

    var self = this;

    _.each(listenerNames, function (listenerName) {
      addToStack(self.listeners(listenerName));
    });

    function addToStack (fn) {
      stack = stack.concat(fn);
    }

    function execStack (err) {
      if (err) return next(err);

      var cur = stack.shift();

      if (cur) {
        try {
          var result = cur.call(method, ctx, execStack, method);
          if (result && typeof result.then === 'function') {
            result.then(function () { next(); }, next);
          }
        } catch (e) {
          next(e);
        }
      } else {
        next();
      }
    }

    return execStack();
  }

  /**
   * Invoke the given api method using the supplied context.
   * Execute registered before/after hooks.
   * @param {Object} ctx Context object
   * @param {Object} method MethodInvocation instance that will be called
   * @param {function (Error=)} cb callback function
   */
  invokeMethodInContext (method, ctx, cb) {
    var self = this;

    self.execHooks('before', method, ctx, function (err) {
      if (err) return triggerErrorAndCallBack(err);

      method.invoke(ctx, function (err, result) {
        debug('poplar.invokeMethodInContext', result);
        ctx.result = result;
        if (err) return triggerErrorAndCallBack(err);

        self.execHooks('after', method, ctx, function (err) {
          if (err) return triggerErrorAndCallBack(err);
          cb();
        });
      });

    });

    function triggerErrorAndCallBack (err) {
      ctx.error = err;
      self.execHooks('afterError', method, ctx, function (hookErr) {
        cb(hookErr || err);
      });
    }
  }

  /*!
   * Search listeners before or after a given method is called
   * @param {String} methodName name for method
   * @param {String} type: `before`, `after`, `afterError`
   */
  searchListeners (methodName, type) {
    var allListenerNames = Object.keys(this._events);
    var listenerNames = [];
    var fullType = util.format('%s.%s', type, methodName);
    _.each(allListenerNames, function (name) {
      if (micromatch.isMatch(fullType, name)) {
        listenerNames.push(name);
      }
    });
    return listenerNames;
  }

  /*!
   * Search listenerTree before or after a given method is called
   * @param {String} methodName name for method
   * @param {String} type Available types: `before`, `after`, `afterError`
   */
  searchListenerTree (methodName, type) {
    var listeners = this._listenerTree[methodName];
    if (listeners) {
      return listeners[type];
    } else {
      return [];
    }
  }

  /**
   * Analyze all listeners and group by method name
   *
   * ``` javascript
   * {
   *   'users.info': {
   *     before: ['before.users.*', 'before.users.info'],
   *     after: ['after.users.*', 'after.users.info'],
   *     afterError: ['afterError.users.*', 'afterError.users.info']
   *   }
   * }
   * ```
   */
  analyzeListenerTree () {
    var methods = this._methods;
    var listenerTree = {};
    var self = this;

    _.each(methods, function (fn, name) {
      listenerTree[name] = listenerTree[name] || {};
      _.each(['before', 'after', 'afterError'], function (type) {
        listenerTree[name][type] = self.searchListeners(name, type) || [];
      });
    });

    this._listenerTree = listenerTree;
  }

  /**
   * Stringifies the query into the pathname, using the apiMethod's http config
   */
  makeHref (methodName, query, defaultHref) {
    assert(methodName, 'no such apiMethod found');
    var apiMethod = this._methods[methodName];
    if (!apiMethod) return defaultHref || methodName;
    return apiMethod.makeHref(query);
  }
}

/*!
 * Object containing Poplar.locals.
 */
Poplar.locals = {};

/**
 * Assigns configuration name to value
 * Retrieve the value of a configuration with Poplar.get().
 */
Poplar.set = Poplar.prototype.set = function (name, obj, mode) {
  mode = mode || 'overwrite';
  switch(mode){
    case 'overwrite':
      Poplar.locals[name] = obj;
      break;
    case 'extend':
      util._extend(Poplar.locals[name], obj);
      break;
  }
};

/**
 * Unsets the configuration name to undefined
 *
 * For example:
 *
 * ```javascript
 * app.set('title', 'My Site');
 * app.get('title');
 * // => "My Site"
 * app.unset('title');
 * app.get('title');
 * // => undefined
 * ```
 */
Poplar.unset = Poplar.prototype.unset = function (name) {
  delete Poplar.locals[name];
};

/**
 * Returns the value of name app configuration, where name is one of strings in the app Poplar.locals table. For example:
 * @param {String} name configuration name
 * @return {*} return configuration value
 * ```javascrpt
 * app.get('title');
 * // => 'undefined'
 *
 * app.set('title', 'My Site');
 * app.get('title');
 * // => "My Site"
 * ```
 */
Poplar.get = Poplar.prototype.get = function (name) {
  return Poplar.locals[name];
};

module.exports = Poplar;

/*!
 * Build hook fn
 */
function addHookFn (proto, name) {
  proto[name] = function () {
    var args = [].splice.call(arguments, 0);
    var fn = args.splice(args.length - 1)[0];
    fn = _.isFunction(fn) ? fn : undefined;
    var self = this;
    _.each(args, function (arg) {
      self.on(util.format('%s.%s', name, arg), fn);
    });
    this.analyzeListenerTree();
  };
}

/**
 * Execute the given function before the matched method string.
 *
 * **Examples:**
 *
 * ```js
 * // Do something before our `user.greet` example, earlier.
 * api.before('user.greet', function (ctx, next) {
 *   if ((ctx.req.param('password') || '').toString() !== '1234') {
 *     next(new Error('Bad password!'));
 *   } else {
 *     next();
 *   }
 * });
 *
 * // Do something before any `user` method.
 * api.before('user.*', function (ctx, next) {
 *   console.log('Calling a user method.');
 *   next();
 * });
 *
 * // Do something before a `dog` instance method.
 * api.before('dog.*', function (ctx, next) {
 *   var dog = this;
 *   console.log('Calling a method on "%s".', dog.name);
 *   next();
 * });
 * ```
 *
 * @param {String} methodMatch The glob to match a method string
 * @callback {Function} hook
 * @param {Context} ctx The adapter specific context
 * @param {Function} next Call with an optional error object
 * @param {ApiMethod} method The ApiMethod object
 */
addHookFn(Poplar.prototype, 'before');

/**
 * Execute the given `hook` function after the matched method string.
 *
 * **Examples:**
 *
 * ```js
 * // Do something after the `speak` instance method.
 * // NOTE: you cannot cancel a method after it has been called.
 * api.after('dog.speak', function (ctx, next) {
 *   console.log('After speak!');
 *   next();
 * });
 *
 * // Do something before all methods.
 * api.before('**', function (ctx, next, method) {
 *   console.log('Calling:', method.name);
 *   next();
 * });
 *
 * // Modify all returned values named `result`.
 * api.after('**', function (ctx, next) {
 *   ctx.result += '!!!';
 *   next();
 * });
 * ```
 *
 * @param {String} methodMatch The glob to match a method string
 * @callback {Function} hook
 * @param {Context} ctx The adapter specific context
 * @param {Function} next Call with an optional error object
 * @param {ApiMethod} method The ApiMethod object
 */
addHookFn(Poplar.prototype, 'after');

/**
 * Execute the given `hook` function after the method matched by the method
 * string failed.
 *
 * **Examples:**
 *
 * ```js
 * // Do something after the `speak` instance method failed.
 * api.afterError('dog.speak', function (ctx, next) {
 *   console.log('Cannot speak!', ctx.error);
 *   next();
 * });
 *
 * // Do something before all methods.
 * api.afterError('**', function (ctx, next, method) {
 *   console.log('Failed', method.name, ctx.error);
 *   next();
 * });
 *
 * // Modify all returned errors
 * api.after('**', function (ctx, next) {
 *   if (!ctx.error.details) ctx.result.details = {};
 *   ctx.error.details.info = 'intercepted by a hook';
 *   next();
 * });
 *
 * // Report a different error
 * api.after('dog.speak', function (ctx, next) {
 *   console.error(ctx.error);
 *   next(new Error('See server console log for details.'));
 * });
 * ```
 *
 * @param {String} methodMatch The glob to match a method string
 * @callback {Function} hook
 * @param {Context} ctx The adapter specific context
 * @param {Function} next Call with an optional error object
 * @param {ApiMethod} method The ApiMethod object
 */
addHookFn(Poplar.prototype, 'afterError');
