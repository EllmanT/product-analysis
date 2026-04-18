import { Head } from '@inertiajs/react';
import { Alert, Button, Card, Container, Stack, Text, Title, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { IconArrowLeft, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import PaymentsLayout from '@/layouts/PaymentsLayout';

type Props = {
    session: { public_id: string; status: string; provider_reference: string | null };
    checkoutId: string | null;
    dataBrands: string;
    baseUrl: string;
    returnUrl: string;
};

export default function ZimswitchWidget({ session, checkoutId, dataBrands, baseUrl, returnUrl }: Props) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const border = isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[2];

    const [scriptError, setScriptError] = useState<string | null>(null);

    const scriptSrc = useMemo(() => {
        if (!baseUrl || !checkoutId) {
            return null;
        }
        return `${baseUrl}/v1/paymentWidgets.js?checkoutId=${encodeURIComponent(checkoutId)}`;
    }, [baseUrl, checkoutId]);

    useEffect(() => {
        if (!scriptSrc) {
            return;
        }

        setScriptError(null);
        const script = document.createElement('script');
        script.async = true;
        script.src = scriptSrc;
        script.onerror = () => setScriptError('Failed to load payment widget. Please try again.');
        document.body.appendChild(script);

        return () => {
            script.remove();
        };
    }, [scriptSrc]);

    return (
        <PaymentsLayout>
            <Head title="Card payment" />
            <Container size="sm" py={{ base: 'xl', md: 60 }}>
                <Stack gap="lg">
                    <Button
                        component="a"
                        href={`/pay/${encodeURIComponent(session.public_id)}`}
                        variant="subtle"
                        leftSection={<IconArrowLeft size={18} />}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Back
                    </Button>

                    <Card withBorder radius="lg" p="xl" bg={isDark ? 'dark.7' : 'white'} style={{ borderColor: border }}>
                        <Stack gap="md">
                            <Title order={2} fw={900} c={isDark ? 'white' : 'dark'}>
                                Pay by card
                            </Title>
                            <Text c="dimmed">
                                Complete your payment securely using the payment widget.
                            </Text>

                            {!checkoutId ? (
                                <Alert color="red" icon={<IconInfoCircle size={16} />}>
                                    Missing checkout id. Please go back and try again.
                                </Alert>
                            ) : null}

                            {scriptError ? (
                                <Alert color="red" icon={<IconInfoCircle size={16} />}>
                                    {scriptError}
                                </Alert>
                            ) : null}

                            {/* OPPWA expects this form element */}
                            {checkoutId ? (
                                <form action={returnUrl} className="paymentWidgets" data-brands={dataBrands} />
                            ) : null}
                        </Stack>
                    </Card>
                </Stack>
            </Container>
        </PaymentsLayout>
    );
}

