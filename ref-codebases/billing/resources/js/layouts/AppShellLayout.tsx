import {
    ActionIcon,
    AppShell,
    Avatar,
    Box,
    Burger,
    Group,
    Menu,
    NavLink,
    Stack,
    Text,
    Title,
    alpha,
    useComputedColorScheme,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, router, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import {
    IconBell,
    IconChartBar,
    IconChartLine,
    IconChartPie,
    IconCreditCard,
    IconCurrencyDollar,
    IconFileInvoice,
    IconFileText,
    IconKey,
    IconLayoutDashboard,
    IconLogout,
    IconPackage,
    IconRepeat,
    IconReportMoney,
    IconSettings2,
    IconShieldCheck,
    IconStack2,
    IconTool,
    IconUsers,
    IconUsersGroup,
} from '@tabler/icons-react';

import ColorSchemeToggle from '@/components/ColorSchemeToggle';
import PageContainer from '@/components/ui/PageContainer';
import type { User } from '@/types/auth';

type NavItem = {
    href?: string;
    label: string;
    icon: React.ElementType;
    children?: { href: string; label: string; icon: React.ElementType }[];
};

type NavGroup = {
    label: string;
    items: NavItem[];
};

const navGroups: NavGroup[] = [
    {
        label: 'Overview',
        items: [
            {
                href: '/dashboard',
                label: 'Dashboard',
                icon: IconLayoutDashboard,
            },
        ],
    },
    {
        label: 'Billing',
        items: [
            {
                href: '/subscriptions',
                label: 'Subscriptions',
                icon: IconRepeat,
            },
            { href: '/invoices', label: 'Invoices', icon: IconFileInvoice },
            { href: '/payments', label: 'Payments', icon: IconCreditCard },
            { href: '/customers', label: 'Customers', icon: IconUsers },
        ],
    },
    {
        label: 'Catalog',
        items: [
            { href: '/products', label: 'Products', icon: IconPackage },
            { href: '/plans', label: 'Plans', icon: IconStack2 },
        ],
    },
    {
        label: 'Analytics',
        items: [
            {
                label: 'Reports',
                icon: IconChartLine,
                children: [
                    {
                        href: '/reports/revenue',
                        label: 'Revenue',
                        icon: IconChartLine,
                    },
                    {
                        href: '/reports/customers',
                        label: 'Customers',
                        icon: IconChartBar,
                    },
                    {
                        href: '/reports/subscriptions',
                        label: 'Subscriptions',
                        icon: IconChartPie,
                    },
                    {
                        href: '/reports/invoices',
                        label: 'Invoices',
                        icon: IconReportMoney,
                    },
                ],
            },
        ],
    },
    {
        label: 'Settings',
        items: [
            {
                href: '/billing-intervals',
                label: 'Billing intervals',
                icon: IconSettings2,
            },
            {
                href: '/exchange-rates',
                label: 'Exchange rates',
                icon: IconCurrencyDollar,
            },
            { href: '/team', label: 'Team', icon: IconUsersGroup },
            { href: '/api-keys', label: 'API Keys', icon: IconKey },
            { href: '/audit', label: 'Audit trail', icon: IconShieldCheck },
            { href: '/system-configuration', label: 'System configuration', icon: IconTool },
            { href: '/log-viewer', label: 'Log viewer', icon: IconFileText },
        ],
    },
];

function pathActive(href: string, current: string): boolean {
    if (href === '/dashboard') {
        return current === '/dashboard';
    }
    return current === href || current.startsWith(`${href}/`);
}

type Props = {
    title: string;
    children: ReactNode;
    subtitle?: string;
    actions?: ReactNode;
};

export default function AppShellLayout({ title, children, subtitle, actions }: Props) {
    const [opened, { toggle, close }] = useDisclosure();
    const { auth } = usePage<{ auth: { user: User | null } }>().props;
    const { url } = usePage();
    const theme = useMantineTheme();
    const colorScheme = useComputedColorScheme('dark', { getInitialValueInEffect: true });
    const isDark = colorScheme === 'dark';

    const user = auth.user;

    const navBg = isDark ? theme.colors.dark[8] : theme.white;
    const mainBg = isDark ? theme.colors.dark[9] : theme.colors.gray[0];
    const headerBg = isDark ? theme.colors.dark[8] : theme.white;
    const borderSubtle = isDark ? alpha(theme.white, 0.06) : theme.colors.gray[3];
    const navMuted = isDark ? theme.colors.dark[0] : theme.colors.gray[7];

    return (
        <AppShell
            header={{ height: 56 }}
            navbar={{
                width: 268,
                breakpoint: 'sm',
                collapsed: { mobile: !opened },
            }}
            padding={0}
            styles={{
                main: { backgroundColor: mainBg },
            }}
        >
            <AppShell.Header
                px="md"
                style={{
                    backgroundColor: headerBg,
                    borderBottom: `1px solid ${borderSubtle}`,
                }}
            >
                <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
                    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                        <img src="/logo.png" alt="Axis Billing" style={{ height: 44, width: 'auto', display: 'block' }} />
                    </Group>
                    <Group gap={4} wrap="nowrap">
                        <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Notifications">
                            <IconBell size={20} stroke={1.5} />
                        </ActionIcon>
                        <ColorSchemeToggle />
                        <Menu shadow="md" width={260} position="bottom-end">
                            <Menu.Target>
                                <Group gap="sm" style={{ cursor: 'pointer' }} wrap="nowrap">
                                    <Avatar radius="xl" color="red" size="md">
                                        {user?.name?.charAt(0).toUpperCase() ?? '?'}
                                    </Avatar>
                                    <Stack gap={0} visibleFrom="sm" style={{ minWidth: 0 }}>
                                        <Text size="sm" fw={700} lineClamp={1} maw={160}>
                                            {user?.name ?? 'Account'}
                                        </Text>
                                        <Text size="xs" c="dimmed" lineClamp={1} maw={180}>
                                            {user?.email ?? ''}
                                        </Text>
                                    </Stack>
                                </Group>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    component={Link}
                                    href="/dashboard"
                                    leftSection={<IconLayoutDashboard size={16} />}
                                >
                                    Dashboard
                                </Menu.Item>
                                <Menu.Item
                                    component={Link}
                                    href="/team"
                                    leftSection={<IconUsersGroup size={16} />}
                                >
                                    Team
                                </Menu.Item>
                                <Menu.Item
                                    component={Link}
                                    href="/audit"
                                    leftSection={<IconShieldCheck size={16} />}
                                >
                                    Audit trail
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item
                                    color="red"
                                    leftSection={<IconLogout size={16} />}
                                    onClick={() => router.post('/logout')}
                                >
                                    Log out
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar
                p="md"
                onClick={() => close()}
                style={{
                    backgroundColor: navBg,
                    borderRight: `1px solid ${borderSubtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Scrollable nav area */}
                <Box style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
                    <Group gap="xs" mb="sm">
                        <div>
                            <Text fw={800} size="sm" c={isDark ? 'white' : 'dark'}>
                                Axis Billing
                            </Text>
                            <Text size="xs" c="dimmed">
                                Workspace
                            </Text>
                        </div>
                    </Group>

                    {navGroups.map(({ label: groupLabel, items }) => (
                        <Box key={groupLabel} mb="xs">
                            <Text size="10px" fw={700} c={navMuted} tt="uppercase" mb={4} lh={1.2}>
                                {groupLabel}
                            </Text>
                            <Stack gap={2}>
                                {items.map((item) => {
                                    const navLinkStyles = (active: boolean) => ({
                                        root: {
                                            borderRadius: theme.radius.md,
                                            fontWeight: 600,
                                            paddingTop: 5,
                                            paddingBottom: 5,
                                            color: active
                                                ? theme.colors.red[4]
                                                : isDark
                                                  ? theme.colors.gray[4]
                                                  : theme.colors.gray[7],
                                            backgroundColor: active
                                                ? alpha(theme.colors.red[9], isDark ? 0.45 : 0.12)
                                                : undefined,
                                        },
                                    });

                                    if (item.children) {
                                        const anyChildActive = item.children.some(c => pathActive(c.href, url));
                                        return (
                                            <NavLink
                                                key={item.label}
                                                label={item.label}
                                                leftSection={<item.icon size={18} stroke={1.5} />}
                                                defaultOpened={anyChildActive}
                                                color="red"
                                                variant="subtle"
                                                styles={navLinkStyles(anyChildActive)}
                                            >
                                                {item.children.map((child) => {
                                                    const childActive = pathActive(child.href, url);
                                                    return (
                                                        <NavLink
                                                            key={child.href}
                                                            component={Link}
                                                            href={child.href}
                                                            label={child.label}
                                                            leftSection={<child.icon size={16} stroke={1.5} />}
                                                            active={childActive}
                                                            color="red"
                                                            variant="subtle"
                                                            styles={navLinkStyles(childActive)}
                                                        />
                                                    );
                                                })}
                                            </NavLink>
                                        );
                                    }

                                    const active = pathActive(item.href!, url);
                                    // Log Viewer is a non-Inertia Blade page (opcodesio/log-viewer). Inertia <Link>
                                    // visits can leave the app on /dashboard while its JS runs, so relative
                                    // API paths resolve to /dashboard/api/* (404). Force a full navigation.
                                    const isLogViewer = item.href === '/log-viewer';
                                    return (
                                        <NavLink
                                            key={item.href}
                                            component={isLogViewer ? 'a' : Link}
                                            href={item.href}
                                            label={item.label}
                                            leftSection={<item.icon size={18} stroke={1.5} />}
                                            active={active}
                                            color="red"
                                            variant="subtle"
                                            styles={navLinkStyles(active)}
                                        />
                                    );
                                })}
                            </Stack>
                        </Box>
                    ))}
                </Box>

                {/* Sticky user card */}
                <Box
                    mt="sm"
                    p="sm"
                    style={{
                        borderRadius: theme.radius.md,
                        backgroundColor: isDark ? alpha(theme.white, 0.04) : theme.colors.gray[1],
                        border: `1px solid ${borderSubtle}`,
                        flexShrink: 0,
                    }}
                >
                    <Group gap="sm" wrap="nowrap">
                        <Avatar radius="md" color="red" size="sm">
                            {user?.name?.charAt(0).toUpperCase() ?? '?'}
                        </Avatar>
                        <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                            <Text size="xs" fw={700} lineClamp={1}>
                                {user?.name ?? 'Account'}
                            </Text>
                            <Text component={Link} href="/team" size="10px" c="dimmed" td="underline">
                                Profile & settings
                            </Text>
                        </Stack>
                    </Group>
                </Box>
            </AppShell.Navbar>

            <AppShell.Main>
                <PageContainer py="xl">
                    <Stack gap="xl">
                        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                            <Stack gap={6} maw={800}>
                                <Title order={1} size="clamp(1.5rem, 2vw, 1.75rem)" fw={800}>
                                    {title}
                                </Title>
                                {subtitle ? (
                                    <Text size="sm" c="dimmed" maw={640}>
                                        {subtitle}
                                    </Text>
                                ) : null}
                            </Stack>
                            {actions ? <Group gap="sm">{actions}</Group> : null}
                        </Group>
                        {children}
                    </Stack>
                </PageContainer>
            </AppShell.Main>
        </AppShell>
    );
}
