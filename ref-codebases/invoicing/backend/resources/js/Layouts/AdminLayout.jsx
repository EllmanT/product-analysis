import {
    AppShell,
    Avatar,
    Box,
    Burger,
    Group,
    NavLink,
    ScrollArea,
    Stack,
    Text,
    ActionIcon,
    useMantineColorScheme,
    ThemeIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, usePage } from '@inertiajs/react';
import {
    RiBillLine,
    RiBuilding2Line,
    RiDashboardLine,
    RiFileList3Line,
    RiGlobalLine,
    RiMoonLine,
    RiSettings3Line,
    RiShoppingBag3Line,
    RiUser3Line,
    RiBox3Line,
    RiSunLine,
    RiCpuLine,
} from 'react-icons/ri';

const nav = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: RiDashboardLine, section: 'overview' },
    { href: '/admin/companies', label: 'Companies', icon: RiBuilding2Line, section: 'data' },
    { href: '/admin/users', label: 'Users', icon: RiUser3Line, section: 'data' },
    { href: '/admin/devices', label: 'Devices', icon: RiCpuLine, section: 'data' },
    { href: '/admin/invoices', label: 'Invoices', icon: RiBillLine, section: 'data' },
    { href: '/admin/products', label: 'Products', icon: RiBox3Line, section: 'data' },
    { href: '/admin/buyers', label: 'Buyers', icon: RiShoppingBag3Line, section: 'data' },
    { href: '/admin/settings/application', label: 'Application', icon: RiSettings3Line, section: 'settings' },
    { href: '/admin/settings/integration', label: 'Integrations & APIs', icon: RiGlobalLine, section: 'settings' },
];

export default function AdminLayout({ title, description, children }) {
    const { auth, url } = usePage();
    const [opened, { toggle }] = useDisclosure();
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const borderSubtle = colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';

    const user = auth?.user;
    const displayName = user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email : '';

    const overview = nav.filter((i) => i.section === 'overview');
    const data = nav.filter((i) => i.section === 'data');
    const settings = nav.filter((i) => i.section === 'settings');

    const navLinkStyles = {
        root: {
            borderRadius: 'var(--mantine-radius-md)',
            marginBottom: 4,
        },
        label: {
            fontWeight: 500,
        },
    };

    return (
        <AppShell
            mode="static"
            header={{ height: 60 }}
            navbar={{ width: 272, breakpoint: 'sm', collapsed: { mobile: !opened } }}
            padding="lg"
            styles={{
                root: {
                    minHeight: '100dvh',
                    width: '100%',
                    maxWidth: '100%',
                    background: 'linear-gradient(165deg, var(--mantine-color-body) 0%, var(--mantine-color-default-hover) 120%)',
                },
                main: {
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                },
                navbar: {
                    background: colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(12px)',
                    borderRight: `1px solid ${borderSubtle}`,
                },
                header: {
                    backdropFilter: 'blur(10px)',
                    background: colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.88)',
                    borderBottom: `1px solid ${borderSubtle}`,
                },
            }}
        >
            <AppShell.Header px="lg">
                <Group h="100%" justify="space-between" wrap="nowrap">
                    <Group gap="md" wrap="nowrap">
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menu" />
                        <Group gap="sm" wrap="nowrap">
                            <ThemeIcon size={36} radius="md" variant="gradient" gradient={{ from: 'red.7', to: 'red.5', deg: 135 }}>
                                <RiFileList3Line size={20} />
                            </ThemeIcon>
                            <div>
                                <Text fw={800} size="sm" lh={1.2} c={colorScheme === 'dark' ? 'red.4' : 'red.8'} style={{ letterSpacing: '-0.02em' }}>
                                    E-Invoicing
                                </Text>
                                <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.12em' }}>
                                    Admin
                                </Text>
                            </div>
                        </Group>
                    </Group>
                    <ActionIcon
                        variant="light"
                        color="gray"
                        size="lg"
                        radius="md"
                        onClick={() => toggleColorScheme()}
                        aria-label="Toggle color scheme"
                    >
                        {colorScheme === 'dark' ? <RiSunLine size={20} /> : <RiMoonLine size={20} />}
                    </ActionIcon>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="md">
                <AppShell.Section grow component={ScrollArea}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs" px={8} style={{ letterSpacing: '0.08em' }}>
                        Overview
                    </Text>
                    {overview.map((item) => (
                        <NavLink
                            key={item.href}
                            component={Link}
                            href={item.href}
                            label={item.label}
                            leftSection={
                                <ThemeIcon variant="light" color="red" size={34} radius="md">
                                    <item.icon size={18} />
                                </ThemeIcon>
                            }
                            active={url === item.href}
                            styles={navLinkStyles}
                        />
                    ))}
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="xl" mb="xs" px={8} style={{ letterSpacing: '0.08em' }}>
                        Data
                    </Text>
                    {data.map((item) => (
                        <NavLink
                            key={item.href}
                            component={Link}
                            href={item.href}
                            label={item.label}
                            leftSection={
                                <ThemeIcon variant="light" color="gray" size={34} radius="md">
                                    <item.icon size={18} />
                                </ThemeIcon>
                            }
                            active={url.startsWith(item.href)}
                            styles={navLinkStyles}
                        />
                    ))}
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="xl" mb="xs" px={8} style={{ letterSpacing: '0.08em' }}>
                        Settings
                    </Text>
                    {settings.map((item) => (
                        <NavLink
                            key={item.href}
                            component={Link}
                            href={item.href}
                            label={item.label}
                            leftSection={
                                <ThemeIcon variant="light" color="gray" size={34} radius="md">
                                    <item.icon size={18} />
                                </ThemeIcon>
                            }
                            active={url.startsWith(item.href)}
                            styles={navLinkStyles}
                        />
                    ))}
                </AppShell.Section>
                <AppShell.Section>
                    <Box
                        pt="md"
                        mt="md"
                        style={{
                            borderTop: `1px solid ${borderSubtle}`,
                        }}
                    >
                        <Group gap="sm" wrap="nowrap">
                            <Avatar color="red" radius="xl" size="md">
                                {displayName.charAt(0).toUpperCase()}
                            </Avatar>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Text size="sm" fw={600} truncate>
                                    {displayName}
                                </Text>
                                <Link
                                    href="/admin/logout"
                                    method="post"
                                    as="button"
                                    type="button"
                                    style={{
                                        fontSize: 'var(--mantine-font-size-xs)',
                                        color: 'var(--mantine-color-dimmed)',
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                    }}
                                >
                                    Sign out
                                </Link>
                            </div>
                        </Group>
                    </Box>
                </AppShell.Section>
            </AppShell.Navbar>

            <AppShell.Main w="100%" maw="100%" style={{ minWidth: 0 }}>
                <Stack gap="lg" w="100%" maw="100%" align="stretch">
                    <Box>
                        <Text
                            size="2rem"
                            fw={800}
                            lh={1.15}
                            style={{ letterSpacing: '-0.03em' }}
                            c="var(--mantine-color-text)"
                        >
                            {title}
                        </Text>
                        {description ? (
                            <Text size="sm" c="dimmed" mt={6} maw={720} style={{ lineHeight: 1.55 }}>
                                {description}
                            </Text>
                        ) : null}
                    </Box>
                    <Box w="100%" maw="100%" style={{ minWidth: 0 }}>
                        {children}
                    </Box>
                </Stack>
            </AppShell.Main>
        </AppShell>
    );
}
