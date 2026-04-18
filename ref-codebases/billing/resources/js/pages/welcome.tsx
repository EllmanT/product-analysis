import { Head, Link, usePage } from '@inertiajs/react';
import {
    Anchor,
    Box,
    Button,
    Card,
    Container,
    Divider,
    Grid,
    Group,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
    Title,
    alpha,
    useComputedColorScheme,
    useMantineTheme,
} from '@mantine/core';
import {
    IconBolt,
    IconChartBar,
    IconCreditCard,
    IconLock,
    IconMail,
    IconMapPin,
    IconPhone,
    IconUsers,
    IconWorld,
} from '@tabler/icons-react';

import LandingLayout from '@/layouts/LandingLayout';
import type { User } from '@/types/auth';

const features = [
    {
        icon: IconUsers,
        title: 'Customer & subscription hub',
        description: 'Centralize customers, plans, and billing lifecycle in one tenant-scoped workspace.',
        color: 'red',
    },
    {
        icon: IconCreditCard,
        title: 'Invoices & payments',
        description: 'Track invoices, record payments, and keep finance teams aligned with clear status.',
        color: 'blue',
    },
    {
        icon: IconChartBar,
        title: 'Operational visibility',
        description: 'Dashboard metrics and reports help you monitor growth and cash flow in real time.',
        color: 'teal',
    },
    {
        icon: IconBolt,
        title: 'Seamless integrations',
        description: 'Session-authenticated JSON API for integrations with your internal tools and workflows.',
        color: 'yellow',
    },
    {
        icon: IconLock,
        title: 'Tenant isolation',
        description: 'Team-scoped data ensures each organization only ever sees its own billing records.',
        color: 'violet',
    },
    {
        icon: IconWorld,
        title: 'Built for Africa',
        description: 'Designed by Axis Solutions, operating across 12 African countries with ISO 9001:2015 certification.',
        color: 'orange',
    },
];

export default function Welcome() {
    const { auth } = usePage<{ auth: { user: User | null } }>().props;
    const colorScheme = useComputedColorScheme('dark', { getInitialValueInEffect: true });
    const isDark = colorScheme === 'dark';
    const theme = useMantineTheme();
    const borderSubtle = isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3];
    const footerBg = isDark ? theme.colors.dark[8] : theme.white;

    return (
        <LandingLayout>
            <Head title="Welcome" />
            <Stack gap={0}>
                <Container size="lg" py={{ base: 'xl', md: 80 }}>
                    <Stack gap="xl" align="center" ta="center">
                        <img src="/logo.png" alt="Axis Billing" style={{ height: 100, width: 'auto', display: 'block' }} />
                        <Title order={1} fz={{ base: 32, sm: 44 }} fw={800} lh={1.15} maw={720} c={isDark ? 'white' : undefined}>
                            Billing infrastructure for modern teams
                        </Title>
                        <Text c="dimmed" size="lg" maw={560}>
                            Axis Billing is a focused SaaS for subscriptions, invoices, and payments—built to
                            feel fast, clear, and consistent across your organization.
                        </Text>
                        <Group gap="md" mt="md">
                            {auth.user ? (
                                <Button component={Link} href="/dashboard" size="md" radius="md">
                                    Go to dashboard
                                </Button>
                            ) : (
                                <Button component={Link} href="/login" size="md" radius="md">
                                    Log in
                                </Button>
                            )}
                        </Group>
                    </Stack>
                </Container>

                <Container size="lg" pb={80}>
                    <Stack gap={4} align="center" mb={48}>
                        <Text size="xs" tt="uppercase" fw={700} c="red">Features</Text>
                        <Title order={2} fz={{ base: 26, sm: 34 }} fw={800} ta="center" c={isDark ? 'white' : undefined}>
                            Everything you need to run billing
                        </Title>
                        <Text c="dimmed" ta="center" maw={520} size="md">
                            One platform to manage your entire billing operation — from customers to cash.
                        </Text>
                    </Stack>
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                        {features.map((f) => (
                            <Card
                                key={f.title}
                                withBorder
                                radius="lg"
                                padding="xl"
                                bg={isDark ? 'dark.7' : 'white'}
                                style={{
                                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[2],
                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                    cursor: 'default',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
                                    (e.currentTarget as HTMLDivElement).style.boxShadow = isDark
                                        ? '0 8px 24px rgba(0,0,0,0.4)'
                                        : '0 8px 24px rgba(0,0,0,0.08)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                                }}
                            >
                                <Box
                                    w={52}
                                    h={52}
                                    mb="md"
                                    style={{
                                        borderRadius: theme.radius.md,
                                        backgroundColor: alpha(theme.colors[f.color as string][6], 0.12),
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    <f.icon size={26} stroke={1.5} color={theme.colors[f.color as string][isDark ? 4 : 6]} />
                                </Box>
                                <Text fw={700} size="md" mb={6} c={isDark ? 'white' : 'dark'}>
                                    {f.title}
                                </Text>
                                <Text size="sm" c="dimmed" lh={1.6}>
                                    {f.description}
                                </Text>
                            </Card>
                        ))}
                    </SimpleGrid>
                </Container>

                <Container size="lg" py="xl">
                    <Card
                        withBorder
                        radius="md"
                        padding="xl"
                        bg={isDark ? 'dark.7' : undefined}
                        style={{
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : undefined,
                        }}
                    >
                        <Grid align="center">
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <Title order={3} mb="xs">
                                    Simple pricing mindset
                                </Title>
                                <Text c="dimmed" size="sm">
                                    Start with your team workspace. Scale usage and integrations as you grow—API
                                    docs and session-based access keep rollout straightforward.
                                </Text>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Stack gap="xs" align="flex-end">
                                    <Text fw={700} size="xl">
                                        Contact us
                                    </Text>
                                    <Anchor href="mailto:sales@axissol.com" size="sm">
                                        sales@axissol.com
                                    </Anchor>
                                </Stack>
                            </Grid.Col>
                        </Grid>
                    </Card>
                </Container>

                {/* Footer */}
                <Box
                    mt="xl"
                    style={{
                        backgroundColor: footerBg,
                        borderTop: `1px solid ${borderSubtle}`,
                    }}
                >
                    <Container size="lg" py={48}>
                        <Grid gutter="xl">
                            {/* Brand */}
                            <Grid.Col span={{ base: 12, sm: 4 }}>
                                <Stack gap="sm">
                                    <img src="/logo.png" alt="Axis Solutions" style={{ height: 'auto', width: '100%', maxWidth: 160, display: 'block' }} />
                                    <Text size="sm" c="dimmed" maw={280}>
                                        Empowering your vision through innovative, customer-centric technological solutions across Africa.
                                    </Text>
                                </Stack>
                            </Grid.Col>

                            {/* Quick links */}
                            <Grid.Col span={{ base: 6, sm: 2 }}>
                                <Text fw={700} size="sm" mb="sm">Product</Text>
                                <Stack gap={6}>
                                    {[
                                        { label: 'Dashboard', href: auth.user ? '/dashboard' : '/login' },
                                        { label: 'Customers', href: '/customers' },
                                        { label: 'Invoices', href: '/invoices' },
                                        { label: 'Reports', href: '/reports/revenue' },
                                    ].map(l => (
                                        <Anchor key={l.label} component={Link} href={l.href} size="sm" c="dimmed">
                                            {l.label}
                                        </Anchor>
                                    ))}
                                </Stack>
                            </Grid.Col>

                            {/* Company links */}
                            <Grid.Col span={{ base: 6, sm: 2 }}>
                                <Text fw={700} size="sm" mb="sm">Company</Text>
                                <Stack gap={6}>
                                    {[
                                        { label: 'About us', href: 'https://www.axissol.com/about-us' },
                                        { label: 'Our services', href: 'https://www.axissol.com/our-services' },
                                        { label: 'News & updates', href: 'https://www.axissol.com/news' },
                                        { label: 'Contact us', href: 'https://www.axissol.com/contact-us' },
                                    ].map(l => (
                                        <Anchor key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" size="sm" c="dimmed">
                                            {l.label}
                                        </Anchor>
                                    ))}
                                </Stack>
                            </Grid.Col>

                            {/* Contact */}
                            <Grid.Col span={{ base: 12, sm: 4 }}>
                                <Text fw={700} size="sm" mb="sm">Contact</Text>
                                <Stack gap="xs">
                                    <Group gap="xs" wrap="nowrap">
                                        <IconMapPin size={15} stroke={1.5} color={theme.colors.gray[5]} style={{ flexShrink: 0 }} />
                                        <Text size="sm" c="dimmed">14 Arundel Road, Alexandra Park, Harare, Zimbabwe</Text>
                                    </Group>
                                    <Group gap="xs">
                                        <IconPhone size={15} stroke={1.5} color={theme.colors.gray[5]} />
                                        <Anchor href="tel:+26308677004041" size="sm" c="dimmed">+263 08677 004041</Anchor>
                                    </Group>
                                    <Group gap="xs">
                                        <IconMail size={15} stroke={1.5} color={theme.colors.gray[5]} />
                                        <Anchor href="mailto:sales@axissol.com" size="sm" c="dimmed">sales@axissol.com</Anchor>
                                    </Group>
                                    <Group gap="xs">
                                        <IconWorld size={15} stroke={1.5} color={theme.colors.gray[5]} />
                                        <Anchor href="https://www.axissol.com/" target="_blank" rel="noopener noreferrer" size="sm" c="dimmed">
                                            www.axissol.com
                                        </Anchor>
                                    </Group>
                                </Stack>
                            </Grid.Col>
                        </Grid>
                    </Container>

                    <Divider color={borderSubtle} />

                    <Container size="lg" py="md">
                        <Group justify="space-between" wrap="wrap" gap="xs">
                            <Text size="xs" c="dimmed">
                                © {new Date().getFullYear()}{' '}
                                <Anchor href="https://www.axissol.com/" target="_blank" rel="noopener noreferrer" size="xs" c="dimmed" fw={600}>
                                    Axis Solutions
                                </Anchor>
                                . All rights reserved.
                            </Text>
                            <Group gap="md">
                                <Anchor href="https://www.axissol.com/privacy-policy" target="_blank" rel="noopener noreferrer" size="xs" c="dimmed">Privacy policy</Anchor>
                                <Anchor href="https://www.axissol.com/contact-us" target="_blank" rel="noopener noreferrer" size="xs" c="dimmed">Support</Anchor>
                            </Group>
                        </Group>
                    </Container>
                </Box>
            </Stack>
        </LandingLayout>
    );
}
