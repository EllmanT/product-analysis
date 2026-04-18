import { Head } from '@inertiajs/react';
import { Card, Container, List, Stack, Text, Title, useComputedColorScheme, useMantineTheme } from '@mantine/core';

import PaymentsLayout from '@/layouts/PaymentsLayout';

export default function Terms() {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const border = isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[2];

    return (
        <PaymentsLayout>
            <Head title="Terms & Conditions" />
            <Container size="sm" py={{ base: 'xl', md: 60 }}>
                <Card withBorder radius="lg" p="xl" bg={isDark ? 'dark.7' : 'white'} style={{ borderColor: border }}>
                    <Stack gap="md">
                        <Title order={2} fw={900}>
                            Terms &amp; Conditions
                        </Title>
                        <Text c="dimmed">
                            These terms govern use of Axis Billing. Replace the sections below with your finalized
                            legal text.
                        </Text>

                        <Title order={3} fw={800} size="h4">
                            Key points
                        </Title>
                        <List spacing="xs">
                            <List.Item>You must be authorized to use your organization’s billing data.</List.Item>
                            <List.Item>Do not attempt to bypass security or abuse the platform.</List.Item>
                            <List.Item>Payments are processed via third-party gateways; availability may vary.</List.Item>
                        </List>

                        <Text size="sm" c="dimmed">
                            Last updated: {new Date().toISOString().slice(0, 10)}
                        </Text>
                    </Stack>
                </Card>
            </Container>
        </PaymentsLayout>
    );
}

