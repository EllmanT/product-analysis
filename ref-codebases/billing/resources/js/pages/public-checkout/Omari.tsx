import { Head, router, usePage } from '@inertiajs/react';
import { Alert, Button, Card, Container, Group, PinInput, Stack, Text, TextInput, Title, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { IconArrowLeft, IconArrowRight, IconDeviceMobile, IconInfoCircle } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import PaymentsLayout from '@/layouts/PaymentsLayout';

type Props = {
    session: { public_id: string; status: string };
    plan: { name: string; product_name: string | null };
    invoice: { amount: string; currency: string };
    omari?: { msisdn?: string; otp_reference?: string | null };
    urls: { auth?: string; confirm?: string; back: string };
};

export default function Omari(props: Props) {
    const { errors } = usePage().props as { errors?: Record<string, string> };
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const border = isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[2];

    const [msisdn, setMsisdn] = useState(props.omari?.msisdn ?? '');
    const [otp, setOtp] = useState('');
    const [busy, setBusy] = useState<'auth' | 'confirm' | null>(null);

    const otpRequested = useMemo(() => !!props.urls.confirm, [props.urls.confirm]);

    return (
        <PaymentsLayout>
            <Head title="Omari" />
            <Container size="sm" py={{ base: 'xl', md: 60 }}>
                <Stack gap="lg">
                    <Button
                        variant="subtle"
                        leftSection={<IconArrowLeft size={18} />}
                        onClick={() => (window.location.href = props.urls.back)}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Back
                    </Button>

                    <Card withBorder radius="lg" p="xl" bg={isDark ? 'dark.7' : 'white'} style={{ borderColor: border }}>
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start">
                                <Stack gap={4}>
                                    <Text size="xs" tt="uppercase" fw={800} c="dimmed">
                                        Omari payment
                                    </Text>
                                    <Title order={2} fw={900} c={isDark ? 'white' : 'dark'}>
                                        {props.plan.product_name ? `${props.plan.product_name} — ` : ''}
                                        {props.plan.name}
                                    </Title>
                                    <Text c="dimmed">
                                        Amount due: <Text span fw={800}>{props.invoice.currency} {Number(props.invoice.amount).toFixed(2)}</Text>
                                    </Text>
                                </Stack>
                                <IconDeviceMobile size={22} />
                            </Group>

                            {errors && Object.keys(errors).length > 0 ? (
                                <Alert color="red" icon={<IconInfoCircle size={16} />}>
                                    {Object.values(errors).join(' ')}
                                </Alert>
                            ) : null}

                            {!otpRequested ? (
                                <>
                                    <TextInput
                                        label="Phone number (MSISDN)"
                                        placeholder="e.g. 0772 123 456"
                                        value={msisdn}
                                        onChange={(e) => setMsisdn(e.target.value)}
                                        required
                                    />
                                    <Button
                                        fullWidth
                                        size="md"
                                        radius="md"
                                        rightSection={<IconArrowRight size={18} />}
                                        loading={busy === 'auth'}
                                        onClick={() => {
                                            if (!props.urls.auth) return;
                                            setBusy('auth');
                                            router.post(props.urls.auth, { msisdn }, { onFinish: () => setBusy(null) });
                                        }}
                                    >
                                        Request OTP
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                                        Enter the OTP sent to your phone to confirm the payment.
                                    </Alert>
                                    <TextInput
                                        label="Phone number (MSISDN)"
                                        value={msisdn}
                                        onChange={(e) => setMsisdn(e.target.value)}
                                        required
                                    />
                                    <Stack gap={6}>
                                        <Text fw={600} size="sm">
                                            OTP
                                        </Text>
                                        <PinInput length={6} oneTimeCode value={otp} onChange={setOtp} />
                                        <Text size="xs" c="dimmed">
                                            {props.omari?.otp_reference ? `OTP reference: ${props.omari.otp_reference}` : ''}
                                        </Text>
                                    </Stack>
                                    <Button
                                        fullWidth
                                        size="md"
                                        radius="md"
                                        rightSection={<IconArrowRight size={18} />}
                                        loading={busy === 'confirm'}
                                        onClick={() => {
                                            if (!props.urls.confirm) return;
                                            setBusy('confirm');
                                            router.post(
                                                props.urls.confirm,
                                                { msisdn, otp },
                                                { onFinish: () => setBusy(null) },
                                            );
                                        }}
                                    >
                                        Confirm payment
                                    </Button>
                                </>
                            )}
                        </Stack>
                    </Card>
                </Stack>
            </Container>
        </PaymentsLayout>
    );
}

