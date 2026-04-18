import { Head } from '@inertiajs/react';
import { Card, Container, List, Stack, Text, Title, useComputedColorScheme, useMantineTheme } from '@mantine/core';

import PaymentsLayout from '@/layouts/PaymentsLayout';

export default function PrivacyPolicy() {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const border = isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[2];

    return (
        <PaymentsLayout>
            <Head title="Privacy policy" />
            <Container size="sm" py={{ base: 'xl', md: 60 }}>
                <Card withBorder radius="lg" p="xl" bg={isDark ? 'dark.7' : 'white'} style={{ borderColor: border }}>
                    <Stack gap="md">
                        <Title order={2} fw={900}>
                            Privacy policy
                        </Title>
                        <Text c="dimmed">
                            This page describes how Axis Billing collects and uses information when you use the service.
                            Replace the sections below with your finalized policy text.
                        </Text>

                        <Title order={3} fw={800} size="h4">
                            What we collect
                        </Title>
                        <List spacing="xs">
                            <List.Item>Account information (name, email, team details)</List.Item>
                            <List.Item>Billing data (customers, subscriptions, invoices, payments)</List.Item>
                            <List.Item>Technical data (logs, IP address, device/browser metadata)</List.Item>
                        </List>

                        <Title order={3} fw={800} size="h4">
                            How we use it
                        </Title>
                        <List spacing="xs">
                            <List.Item>To provide and operate the service</List.Item>
                            <List.Item>To secure the platform and prevent abuse</List.Item>
                            <List.Item>To improve performance and reliability</List.Item>
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

