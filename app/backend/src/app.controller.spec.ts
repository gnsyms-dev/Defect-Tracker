// Unit specs in this repo instantiate their subject directly instead of using
// @nestjs/testing's Test.createTestingModule.
//
// Reason: the entire Nest 12 stack (@nestjs/common, /core, /testing, ...) is
// published as ESM-only ("type": "module", no CommonJS build), while this backend
// compiles to CommonJS. At runtime that works via Node's native require(esm), but
// Jest's own module registry does not use it, so importing @nestjs/testing fails
// with "Must use import to load ES Module" regardless of Node version.
//
// Instantiating directly is also simply better unit testing here: every class uses
// constructor injection, so the DI container adds a dependency without adding any
// coverage.
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ResponseCode } from './shared/enums/response-code.enum';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(() => {
    appController = new AppController(new AppService());
  });

  it('should be defined', () => {
    expect(appController).toBeDefined();
  });

  it('returns the greeting inside the response envelope', () => {
    expect(appController.getHello()).toEqual({
      status: true,
      code: ResponseCode.Ok,
      message: 'OK',
      data: 'Hello World!',
    });
  });
});
