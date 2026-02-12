import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AuthStack } from './lib/auth-stack';
import { StorageStack } from './lib/storage-stack';
import { ComputeStack } from './lib/compute-stack';
import { GatewayStack } from './lib/gateway-stack';

const app = new App();
const authStack = new AuthStack(app, 'AuthStack');
const storageStack = new StorageStack(app, 'StorageStack');
const computeStack = new ComputeStack(app, 'ComputeStack', { bucket: storageStack.bucket });
const gatewayStack = new GatewayStack(app, 'GatewayStack', {
  userPool: authStack.userPool,
  supervisorAgentId: 'AAAAAAAAAA',
  supervisorAgentAliasId: 'BBBBBBBBBB',
});

const json = JSON.stringify(Template.fromStack(gatewayStack).toJSON());
const matches = json.match(/(?<!\d)\d{12}(?!\d)/g);
console.log('12-digit matches:', matches);
if (matches) {
  for (const m of new Set(matches)) {
    const idx = json.indexOf(m);
    console.log('Context:', json.substring(Math.max(0, idx - 120), idx + m.length + 120));
    console.log('---');
  }
}
