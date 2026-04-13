const fs = require('fs');
const path = require('path');
const { Plugin } = require('../../../js/core/plugin-base.js');
const { createLauncher } = require('./launcher-core.js');

class WindowsAppLauncherPlugin extends Plugin {
    async onInit() {
        const pluginDir = __dirname;
        const appsPath = path.join(pluginDir, 'apps.json');
        const legacyPath = path.join(pluginDir, '..', '..', '..', 'server-tools', 'apps.json');

        if (!fs.existsSync(appsPath) && fs.existsSync(legacyPath)) {
            try {
                fs.copyFileSync(legacyPath, appsPath);
                this.context.log('info', '已从 server-tools/apps.json 迁移到插件目录');
            } catch (e) {
                this.context.log('warn', `迁移 apps.json 失败: ${e.message}`);
            }
        }

        this._launcher = createLauncher(pluginDir);
        this.context.log('info', 'Windows 应用启动器插件已就绪');
    }

    getTools() {
        return this._launcher ? this._launcher.getTools() : [];
    }

    async executeTool(name, params) {
        return this._launcher.executeTool(name, params);
    }
}

module.exports = { default: WindowsAppLauncherPlugin, WindowsAppLauncherPlugin };
