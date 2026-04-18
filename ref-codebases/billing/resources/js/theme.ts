import { createTheme } from '@mantine/core';

export const axisTheme = createTheme({
    primaryColor: 'red',
    defaultRadius: 'md',
    defaultGradient: { from: 'red.6', to: 'red.8', deg: 135 },
    fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    headings: {
        fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: '700',
    },
    components: {
        Button: {
            defaultProps: {
                radius: 'md',
            },
        },
        TextInput: {
            defaultProps: {
                radius: 'md',
            },
        },
        Modal: {
            defaultProps: {
                radius: 'md',
            },
        },
    },
});
