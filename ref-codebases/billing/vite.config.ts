import { execSync } from 'node:child_process';

import inertia from '@inertiajs/vite';
import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { defineConfig, loadEnv, type PluginOption } from 'vite';

/**
 * Wayfinder runs `php artisan wayfinder:generate`. On Windows, `npm run dev` often
 * inherits a different PATH than interactive PowerShell, so `php` may resolve to an
 * old install first. We pick a PHP 8.2+ binary from `where.exe php` when possible.
 */
function resolveWayfinderGenerateCommand(env: Record<string, string>): string {
    const explicit =
        env.VITE_WAYFINDER_COMMAND?.trim() ||
        process.env.VITE_WAYFINDER_COMMAND?.trim() ||
        process.env.PHP_BINARY?.trim();
    if (explicit && !explicit.includes('artisan')) {
        // Single path to php.exe — wrap for Windows paths with spaces
        const q = explicit.includes(' ') ? `"${explicit}"` : explicit;
        return `${q} artisan wayfinder:generate`;
    }
    if (explicit?.includes('artisan')) {
        return explicit;
    }

    if (process.platform === 'win32') {
        try {
            const out = execSync('where.exe php', { encoding: 'utf-8', windowsHide: true }).trim();
            const paths = out
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean);
            for (const phpPath of paths) {
                try {
                    const verOut = execSync(`"${phpPath}" -v`, {
                        encoding: 'utf-8',
                        windowsHide: true,
                    });
                    const m = verOut.match(/PHP (\d+)\.(\d+)/);
                    if (m) {
                        const major = parseInt(m[1], 10);
                        const minor = parseInt(m[2], 10);
                        if (major > 8 || (major === 8 && minor >= 2)) {
                            return `"${phpPath}" artisan wayfinder:generate`;
                        }
                    }
                } catch {
                    /* try next candidate */
                }
            }
        } catch {
            /* where.exe failed */
        }
    }

    return 'php artisan wayfinder:generate';
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    const skipWayfinder = env.VITE_SKIP_WAYFINDER === 'true';

    const plugins: PluginOption[] = [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            refresh: true,
        }),
        inertia(),
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
    ];

    if (!skipWayfinder) {
        const command = resolveWayfinderGenerateCommand(env);
        plugins.push(
            wayfinder({
                formVariants: true,
                command,
            }),
        );
    }

    return {
        plugins,
    };
});
