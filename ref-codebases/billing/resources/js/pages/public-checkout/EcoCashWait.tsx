import { Head } from '@inertiajs/react';
import { Alert, Button, Card, Container, Group, Stack, Text, Title, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { IconArrowRight, IconClock, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import PaymentsLayout from '@/layouts/PaymentsLayout';

type Props = {
    session: { public_id: string; status: string; provider_reference: string | null };
    plan: { name: string; product_name: string | null };
    invoice: { amount: string; currency: string };
    urls: { complete: string; status: string; back: string };
};

export default function EcoCashWait({ session, plan, invoice, urls }: Props) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const border = isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[2];

    const [secondsLeft, setSecondsLeft] = useState(120);
    const [timedOut, setTimedOut] = useState(false);

    const amountText = useMemo(() => `${invoice.currency} ${Number(invoice.amount).toFixed(2)}`, [invoice.amount, invoice.currency]);

    useEffect(() => {
        let alive = true;

        const tick = window.setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) {
                    window.clearInterval(tick);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);

        const poll = window.setInterval(async () => {
            try {
                const res = await fetch(urls.status, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });
                if (!res.ok) return;
                const body: unknown = await res.json();
                if (!alive || body === null || typeof body !== 'object') return;

                const paid = 'paid' in body ? Boolean((body as any).paid) : false;
                const status = 'status' in body ? String((body as any).status ?? '') : '';

                if (paid || status === 'succeeded') {
                    window.location.href = urls.complete;
                }
                if (status === 'failed') {
                    window.location.href = urls.complete;
                }
            } catch {
                // ignore transient failures
            }
        }, 5000);

        const timeout = window.setTimeout(() => {
            setTimedOut(true);
            window.clearInterval(poll);
        }, 120_000);

        return () => {
            alive = false;
            window.clearInterval(tick);
            window.clearInterval(poll);
            window.clearTimeout(timeout);
        };
    }, [urls.complete, urls.status]);

    return (
        <PaymentsLayout>
            <Head title="EcoCash pending" />
            <Container size="sm" py={{ base: 'xl', md: 60 }}>
                <Card withBorder radius="lg" p="xl" bg={isDark ? 'dark.7' : 'white'} style={{ borderColor: border }}>
                    <Stack gap="md">
                        <Group justify="space-between" align="flex-start">
                            <Stack gap={4}>
                                <Text size="xs" tt="uppercase" fw={800} c="dimmed">
                                    Waiting for confirmation
                                </Text>
                                <Title order={2} fw={900} c={isDark ? 'white' : 'dark'}>
                                    {plan.product_name ? `${plan.product_name} — ` : ''}
                                    {plan.name}
                                </Title>
                                <Text c="dimmed">
                                    Amount: <Text span fw={800}>{amountText}</Text>
                                </Text>
                            </Stack>
                            <IconClock size={22} />
                        </Group>

                        {timedOut ? (
                            <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
                                Payment timed out. No confirmation was received within 2 minutes.
                            </Alert>
                        ) : (
                            <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                                Waiting for payment confirmation… This page will update automatically. ({secondsLeft}s)
                            </Alert>
                        )}

                        {timedOut ? (
                            <Button
                                component="a"
                                href={urls.back}
                                fullWidth
                                size="md"
                                radius="md"
                                rightSection={<IconArrowRight size={18} />}
                            >
                                Back to payment options
                            </Button>
                        ) : null}
                    </Stack>
                </Card>
            </Container>
        </PaymentsLayout>
    );
}

