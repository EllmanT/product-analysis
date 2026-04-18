import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import type { ComponentType } from 'react';

import AppProviders from '@/providers/AppProviders';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: (name) =>
        resolvePageComponent(
            `./pages/${name}.tsx`,
            import.meta.glob('./pages/**/*.tsx') as Record<
                string,
                () => Promise<{ default: ComponentType }>
            >,
        ).then((page) => page.default),
    setup({ el, App, props }) {
        const app = (
            <AppProviders>
                <App {...props} />
            </AppProviders>
        );

        // SSR: Inertia passes `el: null` and expects a React element for `renderToString`.
        if (el === null) {
            return app;
        }

        createRoot(el).render(app);
    },
    progress: {
        color: '#e03131',
    },
});
