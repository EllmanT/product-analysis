import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';

import { axisTheme } from '@/theme';

type Props = {
    children: ReactNode;
};

export default function AppProviders({ children }: Props) {
    return (
        <>
            <ColorSchemeScript defaultColorScheme="dark" />
            <MantineProvider theme={axisTheme} defaultColorScheme="dark">
                <Notifications position="top-right" zIndex={4000} />
                {children}
            </MantineProvider>
        </>
    );
}
