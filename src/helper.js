import _ from 'lodash';
import pathToRegexp from 'path-to-regexp';

/*!
 * convert obj to string
 */
export function obj2str(val) {
  return Object.prototype.toString.call(val);
}

/*!
 * check if a value is empty
 */
export function isEmpty(val) {
  if (val === 0) return true;
  if (Number.isNaN(val)) return true;
  return !_.isNumber(val) && _.isEmpty(val);
}

/*!
 * check if a value is present
 */
export function isPresent(val) {
  return !isEmpty(val);
}

/*!
 * excape RegExp string
 */
export function escapeRegex(d) {
  // see http://stackoverflow.com/a/6969486/69868
  return d.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
}

export function decodeParam(param) {
  try {
    return decodeURIComponent(param);
  } catch (_) {
    throw new Error('Failed to decode param "' + param + '"');
  }
}

export function pathMatch(path, options) {
  var keys = [];
  var re = pathToRegexp(path, keys, options);
  var service = pathToRegexp.parse(path).reduce((acc, t) => {
    if (_.isString(t)) {
      t = t.replace(/^\//, ''); // replace the start /
      acc.push(t.split('/').join('.'));
    }
    return acc;
  }, []).join('.');

  return [re, service, function (pathname, params) {
    var m = re.exec(pathname);
    if (!m) return false;
    params = params || {};

    var key, param;
    for (var i = 0; i < keys.length; i++) {
      key = keys[i];
      param = m[i + 1];
      if (!param) continue;
      params[key.name] = decodeParam(param);
      if (key.repeat) {
        params[key.name] = params[key.name].split(key.delimiter);
      }
    }

    return params;
  }];
}