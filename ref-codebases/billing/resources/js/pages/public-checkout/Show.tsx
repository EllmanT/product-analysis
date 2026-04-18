import { Head, router } from '@inertiajs/react';
import {
    Box,
    Badge,
    Button,
    Card,
    Container,
    Group,
    Image,
    SimpleGrid,
    Stack,
    Text,
    Title,
    useComputedColorScheme,
    useMantineTheme,
} from '@mantine/core';
import { IconArrowRight, IconCash, IconCreditCard, IconDeviceMobile, IconLock, IconShieldCheck } from '@tabler/icons-react';

import PaymentsLayout from '@/layouts/PaymentsLayout';

type Props = {
    session: {
        public_id: string;
        status: string;
    };
    plan: {
        id: number;
        name: string;
        product_name: string | null;
        billing_interval: string;
        payment_platforms: string[];
    };
    invoice: {
        id: number;
        amount: string;
        currency: string;
    };
    platforms: string[];
    zimswitchOptions: Record<string, { label: string; entity_id: string; data_brands: string }>;
    urls: {
        zimswitch_start: string;
        ecocash_form: string;
        omari_form: string;
    };
};

function PlatformLogo({ src, alt }: { src: string; alt: string }) {
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const theme = useMantineTheme();

    return (
        <Box
            w={42}
            h={42}
            style={{
                borderRadius: theme.radius.md,
                backgroundColor: isDark ? theme.colors.dark[6] : theme.colors.gray[0],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[2]}`,
            }}
        >
            <Image src={src} alt={alt} w={32} h={32} fit="contain" fallbackSrc="" />
        </Box>
    );
}

function OptionButton({
    left,
    label,
    onClick,
}: {
    left: React.ReactNode;
    label: string;
    onClick: () => void;
}) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';

    return (
        <Button
            onClick={onClick}
            fullWidth
            size="md"
            radius="md"
            variant="default"
            leftSection={left}
            rightSection={<IconArrowRight size={18} />}
            styles={{
                root: {
                    justifyContent: 'space-between',
                    paddingLeft: 14,
                    paddingRight: 14,
                    height: 52,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[3],
                    backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
                },
                inner: { width: '100%', justifyContent: 'space-between' },
                label: { width: '100%', textAlign: 'left', fontWeight: 700 },
            }}
        >
            {label}
        </Button>
    );
}

export default function Show({ session, plan, invoice, platforms, zimswitchOptions, urls }: Props) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const border = isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[2];

    const hasZim = platforms.includes('zimswitch');
    const hasEco = platforms.includes('ecocash');
    const hasOmari = platforms.includes('omari');

    const intervalLabel =
        plan.billing_interval
            ?.toString()
            .replaceAll('_', ' ')
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase()) || '';

    return (
        <PaymentsLayout>
            <Head title="Checkout" />
            <Container size="lg" py={{ base: 'xl', md: 60 }}>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                    <Card
                        withBorder
                        radius="lg"
                        p="xl"
                        bg={isDark ? 'dark.7' : 'white'}
                        style={{ borderColor: border }}
                    >
                        <Stack gap="lg">
                            <Stack gap={6}>
                                <Text size="xs" tt="uppercase" fw={800} c="dimmed">
                                    Checkout
                                </Text>
                                <Title order={2} fw={900} c={isDark ? 'white' : 'dark'}>
                                    {plan.product_name ? `${plan.product_name} — ` : ''}
                                    {plan.name}
                                </Title>
                                <Text c="dimmed">Choose a payment option to complete your subscription.</Text>
                            </Stack>

                            <Stack gap="sm">
                                {hasZim &&
                                    Object.entries(zimswitchOptions ?? {}).map(([key, opt]) => (
                                        <OptionButton
                                            key={key}
                                            onClick={() => router.post(urls.zimswitch_start, { option: key })}
                                            label={opt?.label ?? key}
                                            left={<PlatformLogo src="/payment-platform-logos/zimswitch.png" alt="ZimSwitch" />}
                                        />
                                    ))}

                                {hasEco && (
                                    <OptionButton
                                        onClick={() => (window.location.href = urls.ecocash_form)}
                                        label="Pay with EcoCash"
                                        left={<PlatformLogo src="/payment-platform-logos/ecocash.png" alt="EcoCash" />}
                                    />
                                )}

                                {hasOmari && (
                                    <OptionButton
                                        onClick={() => (window.location.href = urls.omari_form)}
                                        label="Pay with Omari"
                                        left={<PlatformLogo src="/payment-platform-logos/omari.png" alt="Omari" />}
                                    />
                                )}

                                {!hasZim && !hasEco && !hasOmari && (
                                    <Text c="dimmed">No payment platforms are configured for this plan.</Text>
                                )}
                            </Stack>
                        </Stack>
                    </Card>

                    <Card
                        withBorder
                        radius="lg"
                        p="xl"
                        bg={isDark ? 'dark.7' : 'white'}
                        style={{ borderColor: border }}
                    >
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start">
                                <Stack gap={4}>
                                    <Text size="xs" tt="uppercase" fw={800} c="dimmed">
                                        Amount due
                                    </Text>
                                    <Text fw={900} fz={34} c={isDark ? 'white' : 'dark'} lh={1.1}>
                                        {invoice.currency} {Number(invoice.amount).toFixed(2)}
                                    </Text>
                                    <Text size="md" fw={700} c={isDark ? theme.colors.gray[2] : theme.colors.gray[7]}>
                                        {plan.product_name ? `${plan.product_name} — ` : ''}
                                        {plan.name}
                                        {intervalLabel ? ` • ${intervalLabel}` : ''}
                                    </Text>
                                </Stack>
                                <Group gap={6}>
                                    <IconCreditCard size={18} />
                                    <IconCash size={18} />
                                    <IconDeviceMobile size={18} />
                                </Group>
                            </Group>

                            <Group gap="xs" wrap="wrap">
                                <Badge
                                    variant="light"
                                    color={isDark ? 'gray' : 'dark'}
                                    leftSection={<IconLock size={14} />}
                                    radius="sm"
                                >
                                    Secure payment
                                </Badge>
                                <Badge
                                    variant="light"
                                    color={isDark ? 'gray' : 'dark'}
                                    leftSection={<IconShieldCheck size={14} />}
                                    radius="sm"
                                >
                                    Encrypted checkout
                                </Badge>
                                <Badge variant="light" color={isDark ? 'gray' : 'dark'} radius="sm">
                                    Quick confirmation
                                </Badge>
                            </Group>
                        </Stack>
                    </Card>
                </SimpleGrid>
            </Container>
        </PaymentsLayout>
    );
}

