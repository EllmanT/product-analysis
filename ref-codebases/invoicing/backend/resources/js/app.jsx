import './bootstrap';
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

const theme = createTheme({
    primaryColor: 'red',
    primaryShade: { light: 7, dark: 5 },
    defaultRadius: 'md',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    headings: {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        fontWeight: '800',
    },
    defaultGradient: { from: 'red.7', to: 'red.4', deg: 135 },
});

createInertiaApp({
    title: (title) => (title ? `${title} — Admin` : 'Admin'),
    resolve: (name) =>
        resolvePageComponent(`./Pages/${name}.jsx`, import.meta.glob('./Pages/**/*.jsx')),
    setup({ el, App, props }) {
        const root = createRoot(el);
        root.render(
            <MantineProvider theme={theme} defaultColorScheme="light">
                <Notifications position="top-right" zIndex={4000} />
                <App {...props} />
            </MantineProvider>
        );
    },
    progress: {
        color: 'red',
    },
});
