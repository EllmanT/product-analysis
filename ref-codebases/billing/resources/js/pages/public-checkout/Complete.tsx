import { Head } from '@inertiajs/react';
import { Button, Card, Container, Group, Stack, Text, Title, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { IconArrowLeft, IconCheck, IconX } from '@tabler/icons-react';
import { useEffect } from 'react';

import PaymentsLayout from '@/layouts/PaymentsLayout';

type Props = {
    session: { public_id: string; status: string; payment_platform: string | null; metadata?: any };
    plan: { name: string; product_name: string | null };
    invoice: { amount: string; currency: string; status: string };
    urls: { back_to_checkout: string; callback_url?: string | null };
};

export default function Complete({ session, plan, invoice, urls }: Props) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const border = isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[2];

    const paid = String(invoice.status).toLowerCase() === 'paid' || String(session.status).toLowerCase() === 'succeeded';
    const failed = String(session.status).toLowerCase() === 'failed';
    const platform = String(session.payment_platform ?? '').toLowerCase();
    const zimStatus = platform === 'zimswitch' ? session?.metadata?.zimswitch?.status : null;
    const detailsLine =
        platform === 'zimswitch' && zimStatus
            ? String(zimStatus.message || zimStatus.description || zimStatus.gateway_description || zimStatus.extended_description || '')
            : '';
    const code = platform === 'zimswitch' ? (zimStatus?.result_code ? String(zimStatus.result_code) : '') : '';

    useEffect(() => {
        if (!paid) return;
        if (!urls.callback_url) return;

        const t = window.setTimeout(() => {
            window.location.href = urls.callback_url as string;
        }, 5000);

        return () => window.clearTimeout(t);
    }, [paid, urls.callback_url]);

    return (
        <PaymentsLayout>
            <Head title="Payment status" />
            <Container size="sm" py={{ base: 'xl', md: 60 }}>
                <Stack gap="lg">
                    <Button
                        component="a"
                        href={urls.back_to_checkout}
                        variant="subtle"
                        leftSection={<IconArrowLeft size={18} />}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Back
                    </Button>

                    <Card withBorder radius="lg" p="xl" bg={isDark ? 'dark.7' : 'white'} style={{ borderColor: border }}>
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start">
                                <Stack gap={4}>
                                    <Text size="xs" tt="uppercase" fw={800} c="dimmed">
                                        Payment status
                                    </Text>
                                    <Title order={2} fw={900} c={isDark ? 'white' : 'dark'}>
                                        {plan.product_name ? `${plan.product_name} — ` : ''}
                                        {plan.name}
                                    </Title>
                                    <Text c="dimmed">
                                        Amount: <Text span fw={800}>{invoice.currency} {Number(invoice.amount).toFixed(2)}</Text>
                                    </Text>
                                </Stack>
                                {paid ? <IconCheck size={22} color={theme.colors.green[5]} /> : failed ? <IconX size={22} color={theme.colors.red[5]} /> : null}
                            </Group>

                            {paid ? (
                                <Stack gap={4}>
                                    <Text fw={700}>Payment completed.</Text>
                                    {urls.callback_url ? (
                                        <Text size="sm" c="dimmed">
                                            Redirecting back in 5 seconds…
                                        </Text>
                                    ) : null}
                                </Stack>
                            ) : failed ? (
                                <Text fw={700}>Payment failed.</Text>
                            ) : (
                                <Text fw={700}>Payment processing…</Text>
                            )}

                            <Text c="dimmed">
                                Platform: <Text span fw={700} c={isDark ? 'white' : 'dark'}>{session.payment_platform ?? '—'}</Text>
                            </Text>

                            {detailsLine ? (
                                <Stack gap={4}>
                                    <Text size="sm" c="dimmed">
                                        {code ? (
                                            <>
                                                Code: <Text span fw={700}>{code}</Text>
                                            </>
                                        ) : null}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        {detailsLine}
                                    </Text>
                                </Stack>
                            ) : null}
                        </Stack>
                    </Card>
                </Stack>
            </Container>
        </PaymentsLayout>
    );
}

