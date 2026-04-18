import { Head, router } from '@inertiajs/react';
import { Button, Card, Container, Group, Radio, Stack, Text, TextInput, Title, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { IconArrowLeft, IconArrowRight, IconDeviceMobile } from '@tabler/icons-react';
import { useState } from 'react';

import PaymentsLayout from '@/layouts/PaymentsLayout';

type Props = {
    session: { public_id: string; status: string };
    plan: { name: string; product_name: string | null };
    invoice: { amount: string; currency: string };
    exchange: { zwg_rate: string };
    urls: { start: string; back: string };
};

export default function EcoCash({ session, plan, invoice, exchange, urls }: Props) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const border = isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[2];

    const [phone, setPhone] = useState('');
    const [currency, setCurrency] = useState<'USD' | 'ZWG'>(() => (invoice.currency === 'USD' ? 'USD' : 'ZWG'));
    const [busy, setBusy] = useState(false);

    const baseUsd = Number(invoice.amount);
    const zwgRate = Number(exchange?.zwg_rate ?? '30');
    const convertedAmount =
        currency === 'ZWG'
            ? baseUsd * (Number.isFinite(zwgRate) ? zwgRate : 0)
            : baseUsd;

    return (
        <PaymentsLayout>
            <Head title="EcoCash" />
            <Container size="sm" py={{ base: 'xl', md: 60 }}>
                <Stack gap="lg">
                    <Button
                        variant="subtle"
                        leftSection={<IconArrowLeft size={18} />}
                        onClick={() => (window.location.href = urls.back)}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Back
                    </Button>

                    <Card withBorder radius="lg" p="xl" bg={isDark ? 'dark.7' : 'white'} style={{ borderColor: border }}>
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start">
                                <Stack gap={4}>
                                    <Text size="xs" tt="uppercase" fw={800} c="dimmed">
                                        EcoCash payment
                                    </Text>
                                    <Title order={2} fw={900} c={isDark ? 'white' : 'dark'}>
                                        {plan.product_name ? `${plan.product_name} — ` : ''}
                                        {plan.name}
                                    </Title>
                                    <Text c="dimmed">
                                        Amount due:{' '}
                                        <Text span fw={800}>
                                            {currency} {Number.isFinite(convertedAmount) ? convertedAmount.toFixed(2) : '0.00'}
                                        </Text>
                                    </Text>
                                </Stack>
                                <IconDeviceMobile size={22} />
                            </Group>

                            <Radio.Group
                                label="Currency"
                                description="Choose the currency for this EcoCash payment."
                                value={currency}
                                onChange={(v) => setCurrency((v as 'USD' | 'ZWG') ?? 'ZWG')}
                            >
                                <Group mt="xs">
                                    <Radio value="USD" label="USD" />
                                    <Radio value="ZWG" label="ZWG" />
                                </Group>
                            </Radio.Group>

                            <TextInput
                                label="Phone number"
                                placeholder="e.g. 0772 123 456"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                required
                            />

                            <Button
                                fullWidth
                                size="md"
                                radius="md"
                                rightSection={<IconArrowRight size={18} />}
                                loading={busy}
                                onClick={() => {
                                    setBusy(true);
                                    router.post(
                                        urls.start,
                                        { phone_number: phone, currency },
                                        { onFinish: () => setBusy(false) },
                                    );
                                }}
                            >
                                Send EcoCash prompt
                            </Button>
                        </Stack>
                    </Card>
                </Stack>
            </Container>
        </PaymentsLayout>
    );
}

