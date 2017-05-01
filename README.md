MostlyJS with Poplarjs
======================

[![Build Status](https://travis-ci.org/mostlyjs/mostly-poplarjs.svg)](https://travis-ci.org/mostlyjs/mostly-poplarjs)

This module provides quick steps to create [MostlyJS](https://github.com/MostlyJS/mostly-node) microservices with [Poplarjs](https://github.com/poplarjs/poplar).

# Usage

## Installation

```bash
npm install mostly-poplarjs
```

## Quick Example

Convert your Poplarjs APIs into microservices is easy enough.

Your existing Poplarjs code
```javascript
// dummy_api.js
const ApiBuilder = poplar.ApiBuilder;
var DummyApi = new ApiBuilder('dummies');
DummyApi.define('info', {...});
....
module.exports = DummyApi;
```

Wrapping it as standalone server
```javascript
import nats from 'nats';
import mostly from 'mostly-node';
import poplar from 'mostly-poplarjs';
import dummyApi from './dummy_api';

const trans = new mostly(nats.connect());
trans.ready(() => {
  var app = poplar.create(trans)
    .use(dummyApi)
    .handler();
});
```

That's all, the service will register itself with NATS and can be called remotely.

# License

MIT