/**
 * Windows 应用启动器核心逻辑（插件专用，数据目录可配置）
 */
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const iconv = require('iconv-lite');

const execAsync = promisify(exec);

const CONFIG_BASENAME = 'apps.json';

const LAUNCH_APP_TOOL = {
    type: 'function',
    function: {
        name: 'launch_application',
        description:
            '根据应用名称启动用户电脑上的一个指定应用程序。应用名称由本插件目录下的 apps.json 维护（首次会扫描桌面并合并）。',
        parameters: {
            type: 'object',
            properties: {
                appName: {
                    type: 'string',
                    description:
                        "要启动的应用程序的名称，例如 'QQ', '记事本', '计算器' 等。须与 apps.json 中的键名匹配（不区分大小写）。"
                }
            },
            required: ['appName']
        }
    }
};

/**
 * @param {string} pluginDir - 插件根目录（存放 apps.json）
 */
function createLauncher(pluginDir) {
    let hasScanned = false;

    const configPath = () => path.join(pluginDir, CONFIG_BASENAME);

    async function getDesktopPath() {
        try {
            const { stdout } = await execAsync(
                `chcp 65001 > nul && powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`,
                { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }
            );
            const desktopPath = iconv.decode(stdout, 'utf8').trim();
            if (desktopPath && desktopPath.length > 0) {
                return desktopPath;
            }
        } catch (error) {
            console.warn(`[AppLauncher] PowerShell 获取桌面路径失败: ${error.message}`);
        }

        const userProfile = process.env.USERPROFILE;
        const possiblePaths = [
            path.join(userProfile, 'Desktop'),
            path.join(userProfile, '桌面'),
            path.join(userProfile, 'OneDrive', 'Desktop'),
            path.join(userProfile, 'OneDrive', '桌面')
        ];

        for (const p of possiblePaths) {
            try {
                await fs.access(p);
                return p;
            } catch (e) {
                /* skip */
            }
        }

        return path.join(userProfile, 'Desktop');
    }

    async function resolveLnkPath(lnkPath) {
        const tempScriptPath = path.join(
            os.tmpdir(),
            `app_launcher_resolve_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.ps1`
        );

        try {
            const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("${lnkPath.replace(/\\/g, '\\\\').replace(/'/g, "''")}")
Write-Output $shortcut.TargetPath
`;
            const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
            const content = Buffer.concat([BOM, Buffer.from(psScript, 'utf8')]);
            await fs.writeFile(tempScriptPath, content);

            const { stdout, stderr } = await execAsync(
                `chcp 65001 > nul && powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`,
                { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }
            );

            const targetPath = iconv.decode(stdout, 'utf8').trim();

            if (stderr && stderr.length > 0) {
                const errMsg = iconv.decode(stderr, 'utf8');
                if (errMsg && !errMsg.includes('ProgressPreference') && !errMsg.includes('Active code page')) {
                    console.warn(`[AppLauncher] PowerShell警告: ${errMsg}`);
                }
            }

            return targetPath || null;
        } catch (error) {
            console.warn(`[AppLauncher] 解析快捷方式失败 ${lnkPath}:`, error.message);
            return null;
        } finally {
            try {
                await fs.unlink(tempScriptPath);
            } catch (e) {
                /* ignore */
            }
        }
    }

    async function resolveUrlPath(urlPath) {
        try {
            const content = await fs.readFile(urlPath, 'utf8');
            const lines = content.split(/\r?\n/);
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('URL=')) {
                    const url = trimmed.substring(4).trim();
                    if (url) {
                        return url;
                    }
                }
            }
            return null;
        } catch (error) {
            console.warn(`[AppLauncher] 解析Internet快捷方式失败 ${urlPath}:`, error.message);
            return null;
        }
    }

    async function getPublicDesktopPath() {
        try {
            const { stdout } = await execAsync(
                `chcp 65001 > nul && powershell -NoProfile -Command "[Environment]::GetFolderPath('CommonDesktopDirectory')"`,
                { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }
            );
            const desktopPath = iconv.decode(stdout, 'utf8').trim();
            if (desktopPath && desktopPath.length > 0) {
                return desktopPath;
            }
        } catch (error) {
            /* skip */
        }

        return 'C:\\Users\\Public\\Desktop';
    }

    async function scanDirectory(dirPath, scannedApps, dirName) {
        try {
            const files = await fs.readdir(dirPath);

            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const ext = path.extname(file).toLowerCase();

                try {
                    const stats = await fs.stat(fullPath);
                    if (!stats.isFile()) continue;

                    const appName = path.basename(file, ext);
                    let appPath = null;

                    if (ext === '.exe') {
                        appPath = fullPath;
                        console.log(`[AppLauncher] 扫描到应用: ${appName} -> ${fullPath}`);
                    } else if (ext === '.lnk') {
                        const targetPath = await resolveLnkPath(fullPath);
                        if (targetPath) {
                            appPath = targetPath;
                            console.log(`[AppLauncher] 扫描到快捷方式: ${appName} -> ${targetPath}`);
                        }
                    } else if (ext === '.url') {
                        const url = await resolveUrlPath(fullPath);
                        if (url) {
                            appPath = url;
                            console.log(`[AppLauncher] 扫描到网址快捷方式: ${appName} -> ${url}`);
                        }
                    }

                    if (appPath && !scannedApps[appName]) {
                        scannedApps[appName] = appPath;
                    }
                } catch (fileError) {
                    console.warn(`[AppLauncher] 处理文件 ${file} 时出错:`, fileError.message);
                }
            }
        } catch (error) {
            console.warn(`[AppLauncher] 扫描${dirName}失败:`, error.message);
        }
    }

    async function scanDesktopApps() {
        const scannedApps = {};
        const userDesktop = await getDesktopPath();
        console.log(`[AppLauncher] 扫描用户桌面: ${userDesktop}`);
        await scanDirectory(userDesktop, scannedApps, '用户桌面');
        const publicDesktop = await getPublicDesktopPath();
        console.log(`[AppLauncher] 扫描公共桌面: ${publicDesktop}`);
        await scanDirectory(publicDesktop, scannedApps, '公共桌面');
        console.log(`[AppLauncher] 桌面扫描完成，共找到 ${Object.keys(scannedApps).length} 个应用`);
        return scannedApps;
    }

    function mergeApps(existingApps, newApps) {
        const merged = { ...existingApps };
        let addedCount = 0;
        for (const [appName, appPath] of Object.entries(newApps)) {
            if (!merged[appName]) {
                merged[appName] = appPath;
                addedCount++;
                console.log(`[AppLauncher] 添加新应用: ${appName}`);
            }
        }
        console.log(`[AppLauncher] 合并完成，新增 ${addedCount} 个应用`);
        return merged;
    }

    async function saveApps(apps) {
        const cfg = configPath();
        try {
            await fs.writeFile(cfg, JSON.stringify(apps, null, 4), 'utf-8');
            console.log(`[AppLauncher] 配置文件保存成功`);
            return true;
        } catch (error) {
            console.error(`[AppLauncher] 保存配置文件错误:`, error.message);
            return false;
        }
    }

    async function loadApps() {
        const cfg = configPath();

        if (!hasScanned) {
            hasScanned = true;
            console.log(`[AppLauncher] 首次加载，开始扫描桌面应用...`);

            try {
                let existingApps = {};
                try {
                    const data = await fs.readFile(cfg, 'utf-8');
                    existingApps = JSON.parse(data);
                } catch (readError) {
                    console.log(`[AppLauncher] 未找到现有配置文件，将创建新的`);
                }

                const scannedApps = await scanDesktopApps();
                const mergedApps = mergeApps(existingApps, scannedApps);
                await saveApps(mergedApps);
                return mergedApps;
            } catch (error) {
                console.error(`[AppLauncher] 自动扫描过程出错:`, error.message);
            }
        }

        try {
            const data = await fs.readFile(cfg, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`[AppLauncher] 读取配置文件错误:`, error.message);
            return null;
        }
    }

    async function startApplication(parameters) {
        const appNameToLaunch = parameters.appName;
        if (!appNameToLaunch) {
            return '错误：未提供应用名称 (appName)。';
        }

        const apps = await loadApps();
        if (!apps) {
            return `错误：无法加载应用列表，请检查插件目录下的 ${CONFIG_BASENAME} 文件。`;
        }

        const appKeys = Object.keys(apps);
        const foundKey = appKeys.find(key => key.toLowerCase() === appNameToLaunch.toLowerCase());

        if (foundKey) {
            const appPath = apps[foundKey];
            console.log(`[AppLauncher] 正在尝试启动 "${foundKey}"，路径: ${appPath}`);

            try {
                const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(appPath);

                if (isUrl) {
                    const child = spawn('cmd', ['/c', 'start', '', appPath], {
                        detached: true,
                        stdio: 'ignore',
                        shell: true
                    });
                    child.unref();
                    return `已成功打开 "${foundKey}": ${appPath}`;
                }

                await fs.access(appPath);
                const child = spawn(`"${appPath}"`, [], {
                    detached: true,
                    stdio: 'ignore',
                    shell: true,
                    cwd: path.dirname(appPath)
                });
                child.unref();
                return `已成功发送启动 "${foundKey}" 的指令。`;
            } catch (error) {
                console.error(`[AppLauncher] 启动 "${foundKey}" 失败:`, error);
                if (error.code === 'ENOENT') {
                    return `错误：应用 "${foundKey}" 的路径 "${appPath}" 无效或文件不存在。`;
                }
                return `错误：启动 "${foundKey}" 时发生未知服务器错误。`;
            }
        }

        return `错误：在配置文件中未找到名为 "${appNameToLaunch}" 的应用。可用的应用有：${appKeys.join(', ')}。`;
    }

    return {
        getTools() {
            return [LAUNCH_APP_TOOL];
        },
        async executeTool(name, params) {
            if (name === 'launch_application') {
                return await startApplication(params);
            }
            throw new Error(`[AppLauncher] 不支持此功能: ${name}`);
        }
    };
}

module.exports = { createLauncher };
