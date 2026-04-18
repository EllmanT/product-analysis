import { Anchor, AppShell, Group, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { Link, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';

import ColorSchemeToggle from '@/components/ColorSchemeToggle';
import type { User } from '@/types/auth';

type Props = {
    children: ReactNode;
};

export default function LandingLayout({ children }: Props) {
    const { auth } = usePage<{ auth: { user: User | null } }>().props;
    const theme = useMantineTheme();
    const colorScheme = useComputedColorScheme('dark', { getInitialValueInEffect: true });
    const isDark = colorScheme === 'dark';

    return (
        <AppShell
            header={{ height: 56 }}
            padding={0}
            styles={{
                main: {
                    backgroundColor: isDark ? theme.colors.dark[9] : theme.colors.gray[0],
                },
            }}
        >
            <AppShell.Header
                px="md"
                style={{
                    backgroundColor: isDark ? theme.colors.dark[8] : theme.white,
                    borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3]}`,
                }}
            >
                <Group h="100%" justify="space-between">
                    <img src="/logo.png" alt="Axis Billing" style={{ height: 44, width: 'auto', display: 'block' }} />
                    <Group gap="sm">
                        <ColorSchemeToggle />
                        {auth.user ? (
                            <Anchor component={Link} href="/dashboard" size="sm" fw={600} c="red">
                                Dashboard
                            </Anchor>
                        ) : (
                            <Anchor component={Link} href="/login" size="sm" fw={600} c="red">
                                Log in
                            </Anchor>
                        )}
                    </Group>
                </Group>
            </AppShell.Header>
            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
}
