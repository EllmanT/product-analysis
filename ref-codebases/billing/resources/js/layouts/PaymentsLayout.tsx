import { Anchor, AppShell, Box, Group, Text, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import type { ReactNode } from 'react';

import ColorSchemeToggle from '@/components/ColorSchemeToggle';

type Props = {
    children: ReactNode;
};

export default function PaymentsLayout({ children }: Props) {
    const theme = useMantineTheme();
    const colorScheme = useComputedColorScheme('dark', { getInitialValueInEffect: true });
    const isDark = colorScheme === 'dark';
    const border = isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3];

    return (
        <AppShell header={{ height: 56 }} padding={0} styles={{ main: { backgroundColor: isDark ? theme.colors.dark[9] : theme.colors.gray[0] } }}>
            <AppShell.Header
                px="md"
                style={{
                    backgroundColor: isDark ? theme.colors.dark[8] : theme.white,
                    borderBottom: `1px solid ${border}`,
                }}
            >
                <Group h="100%" justify="space-between">
                    <img src="/logo.png" alt="Axis Billing" style={{ height: 44, width: 'auto', display: 'block' }} />
                    <Group gap="sm">
                        <ColorSchemeToggle />
                    </Group>
                </Group>
            </AppShell.Header>
            <AppShell.Main>
                <Box style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
                    <Box style={{ flex: 1 }}>{children}</Box>

                    <Box
                        px="md"
                        py="md"
                        style={{
                            borderTop: `1px solid ${border}`,
                            backgroundColor: isDark ? theme.colors.dark[8] : theme.white,
                        }}
                    >
                        <Group justify="space-between" wrap="wrap" gap="xs">
                            <Text size="xs" c="dimmed">
                                <Anchor
                                    href="https://www.axissol.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    size="xs"
                                    fw={700}
                                    c="dimmed"
                                >
                                    Axis Solutions
                                </Anchor>
                            </Text>

                            <Group gap="md" wrap="wrap">
                                <Text size="xs" c="dimmed">
                                    © {new Date().getFullYear()} Axis Billing. All rights reserved.
                                </Text>
                                <Anchor href="/terms" size="xs" c="dimmed">
                                    Terms &amp; Conditions
                                </Anchor>
                                <Anchor href="/privacy-policy" size="xs" c="dimmed">
                                    Privacy policy
                                </Anchor>
                            </Group>
                        </Group>
                    </Box>
                </Box>
            </AppShell.Main>
        </AppShell>
    );
}

