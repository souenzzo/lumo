/* @flow */

import net from 'net';

let socketRepl = require('../socketRepl');

const mockOn = jest.fn((type: string, f: (x?: string) => void) => {
  switch (type) {
    case 'line':
      f('(+ 1 2');
      return f(')');
    default:
      return f();
  }
});

jest.mock('../repl');
jest.mock('readline', () => ({
  createInterface: jest.fn((opts: { [mockKey: string]: mixed }) => ({
    on: mockOn,
    output: opts.output,
    write: jest.fn(),
  })),
}));

function mockCreateSession(): void {
  const repl = require('../repl'); // eslint-disable-line global-require
  repl.createSession = jest.fn((rl: readline$Interface, isMain: boolean) => ({
    id: 1,
    rl,
    isMain,
  }));
}

type SocketCallback = { (socket: net$Socket): void };

const serverHost = '0.0.0.0';
const serverPort = 12345;
const netCreateServer = net.createServer;
const netServerListen = net.Server.prototype.listen;
const netServerClose = net.Server.prototype.close;
const netSocketWrite = net.Socket.prototype.write;
const netSocketOn = net.Socket.prototype.on;

describe('open', () => {
  const processOn = process.on;
  let socketServer;

  beforeEach(() => {
    process.on = jest.fn();
    net.createServer = jest.fn((callback: SocketCallback) => {
      socketServer = new net.Server();
      return socketServer;
    });
    net.Server.prototype.listen = jest.fn(function listen(
      port: number,
      host: ?string,
      cb: () => void,
    ): net$Server {
      cb();
      return this;
    });
    net.Server.prototype.close = jest.fn();
  });

  afterEach(() => {
    socketServer = null;
    socketRepl.close();
    net.createServer = netCreateServer;
    net.Server.prototype.listen = netServerListen;
    net.Server.prototype.close = netServerClose;
    process.on = processOn;
  });

  it('creates a server listening on a specified host and port', () => {
    socketRepl.open({ port: serverPort, host: serverHost });

    expect(socketServer.listen).toHaveBeenCalledTimes(1);
    expect(socketServer.listen.mock.calls[0].slice(0, 2)).toEqual([
      serverPort,
      serverHost,
    ]);
  });

  it('registers process handlers for SIGHUP & SIGTERM', () => {
    socketRepl.open({ port: serverPort, host: serverHost });

    expect(process.on).toHaveBeenCalledTimes(2);
    expect(
      process.on.mock.calls.map((x: [string, () => void]) => x[0]),
    ).toEqual(['SIGTERM', 'SIGHUP']);
  });

  it('defaults to localhost if no host specified', () => {
    socketRepl.open({ port: serverPort });

    expect(socketServer.listen).toHaveBeenCalledTimes(1);
    expect(socketServer.listen.mock.calls[0].slice(0, 2)).toEqual([
      serverPort,
      'localhost',
    ]);
  });
});

describe('close', () => {
  let socketServer;

  beforeEach(() => {
    socketRepl = require('../socketRepl'); // eslint-disable-line global-require
    net.createServer = jest.fn((callback: SocketCallback) => {
      socketServer = new net.Server();
      return socketServer;
    });
    net.Server.prototype.listen = jest.fn(function listen(
      port: number,
      host: ?string,
    ): net$Server {
      return this;
    });
    net.Server.prototype.close = jest.fn(() => {
      socketServer = null;
    });
  });

  afterEach(() => {
    socketRepl.close();
    socketServer = null;
    net.createServer = netCreateServer;
    net.Server.prototype.listen = netServerListen;
    net.Server.prototype.close = netServerClose;
  });

  it("doesn't close the server if already closed", () => {
    socketRepl.close();

    expect(socketServer).toBeUndefined();
    expect(net.Server.prototype.close).not.toHaveBeenCalled();
  });

  it('closes the server', () => {
    socketRepl.open({ port: serverPort, host: serverHost });
    socketRepl.close();

    expect(net.Server.prototype.close).toHaveBeenCalledTimes(1);
  });
});

describe('handleConnection', () => {
  let handleConnection;
  let socket: ?net$Socket = null;

  beforeEach(() => {
    net.createServer = jest.fn((callback: SocketCallback) => {
      handleConnection = callback;
      return {
        listen: jest.fn(function listen(
          port: number,
          host: ?string,
        ): net$Server {
          return this;
        }),
        close: jest.fn(),
        on: jest.fn(),
      };
    });
    net.Socket.prototype.write = jest.fn((text: string) => undefined);
    socketRepl.open({ port: serverPort, host: serverHost });
    socket = new net.Socket();
    socket.on = jest.fn((type: string, f: () => void) => f());
  });

  afterEach(() => {
    socket.end();
    net.createServer = netCreateServer;
    net.Socket.prototype.write = netSocketWrite;
    net.Socket.prototype.on = netSocketOn;
  });

  it('prints welcome message and prompt', () => {
    mockCreateSession();
    handleConnection(socket);
    expect(socket.write).toHaveBeenCalled();
  });

  it('tears down every active socket connection on close', () => {
    mockCreateSession();
    handleConnection(socket);
    socket.destroy = jest.fn();
    socketRepl.close();
    expect(socket.destroy).toHaveBeenCalled();
  });
});
