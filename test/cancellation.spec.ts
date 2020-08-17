import * as loader from '@grpc/proto-loader';
import * as grpcNative from 'grpc';
import {sendUnaryData, ServerUnaryCall} from 'grpc';
import * as grpcJs from '@grpc/grpc-js';
import {expect} from 'chai';

const proto = loader.loadSync(require.resolve('../proto/service.proto'));

class ServiceImpl {

  private error?: string;

  constructor(private readonly client: any, private readonly mkMetadata: any) {
  }

  CallSelf(call: ServerUnaryCall<{delay: number}>, callback: sendUnaryData<{}>) {
    setTimeout(() => this.client.CallSelf({delay: call.request.delay}, this.mkMetadata(), {parent: call}, (err, result) => {
      if (err && err.code === grpcJs.status.CANCELLED) {
        this.error = err.message;
      }
      callback(err, result);
    }), call.request.delay)
    ;
  };

  GetError(call: ServerUnaryCall<{}>, callback: sendUnaryData<{message: string}>) {
    callback(null, {message: this.error});
  };
}

describe('client side cancellation', function () {

  this.timeout(10000);

  const suites = {
    'native': grpcNative,
    'js': grpcJs,
  };

  Object.keys(suites).forEach(label => {

    describe(label, () => {

      const {client, mkMetadata} = setup(suites[label]);

      it('happens as expected', done => {
        client.CallSelf({delay: 50}, mkMetadata(), {deadline: Date.now() + 200}, (err, response) => {
          expect(err).to.have.property('message').that.matches(/DEADLINE/);
          setTimeout(() => {
            client.GetError({}, (err, {message}) => {
              expect(message).to.match(/CANCELLED/);
              done();
            });
          }, 1000)
        });
      });
    });
  });

  function setup(grpc: any) {
    const packageDef = grpc.loadPackageDefinition(proto) as any;
    const mkMetadata = () => new grpc.Metadata();
    const server = new grpc.Server();
    const client = new packageDef.wix.Service('localhost:3001', grpc.credentials.createInsecure());
    const service = new ServiceImpl(client, mkMetadata);
    server.addService(packageDef.wix.Service.service, service);
    before(done => {
      server.bindAsync('0.0.0.0:3001', (grpc as any).ServerCredentials.createInsecure(), err => {
        if (err) {
          done(err);
        } else {
          server.start();
          done();
        }
      })
    });
    after(() => {
      server.forceShutdown();
    });

    return {client, mkMetadata};
  }
});
