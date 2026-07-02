import * as fs from 'fs';
import * as path from 'path';
import * as TJS from 'typescript-json-schema';
import { Branding, ServerCfg } from '../src/config/config';
import { generateConfigTemplate } from '../src/config/config-template';

const pkgJson = require('../package.json');

export const createConfigSchema = (): any => {
    const program = TJS.getProgramFromFiles(
        [path.resolve(path.join(__dirname, '../src/config/config.ts'))],
    );

    return TJS.generateSchema(
        program,
        'Config',
        {
            // required: true,
            defaultProps: true,
            propOrder: true,
        },
    );
};

try {
    fs.mkdirSync('build');
} catch {}

try {
    fs.mkdirSync('dist/config', {recursive: true});
} catch {}

const schema = createConfigSchema();

schema.properties.serverCfg.default = new ServerCfg();

// TJS cannot evaluate the `new Branding()` initializer expression, so the
// generated schema has no default for branding. Provide it explicitly (same
// as serverCfg above) so the config template and validator defaults are complete.
schema.properties.branding.default = new Branding();

fs.writeFileSync(
    path.resolve(path.join(__dirname, '../dist/VERSION')),
    pkgJson.version,
);
fs.writeFileSync(
    path.resolve(path.join(__dirname, '../build/server-manager-template.json')),
    generateConfigTemplate(schema),
);
fs.writeFileSync(
    path.resolve(path.join(__dirname, '../dist/config/config.schema.json')),
    JSON.stringify(schema),
);
fs.writeFileSync(
    path.resolve(path.join(__dirname, '../src/config/config.schema.json')),
    JSON.stringify(schema),
);
