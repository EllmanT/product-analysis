import {
    Button,
    CopyButton,
    NumberInput,
    Paper,
    PasswordInput,
    Stack,
    Tabs,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { router, usePage } from '@inertiajs/react';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import AdminLayout from '../../../Layouts/AdminLayout';

export default function Integration({ settings, envNote, oauthCallbackUrls }) {
    const { flash, errors } = usePage().props;

    useEffect(() => {
        if (flash?.success) {
            notifications.show({ title: 'Saved', message: flash.success, color: 'green' });
        }
    }, [flash?.success]);

    const form = useForm({
        initialValues: {
            zimra_api_url: settings.zimra_api_url,
            fiscalcloud_api_url: settings.fiscalcloud_api_url,
            fiscalcloud_api_timeout: settings.fiscalcloud_api_timeout,
            fiscalcloud_api_key: settings.fiscalcloud_api_key ?? '',
            docs_ai_url: settings.docs_ai_url ?? '',
            axis_billing_base_url: settings.axis_billing_base_url,
            axis_billing_api_key: settings.axis_billing_api_key,
            axis_billing_webhook_secret: settings.axis_billing_webhook_secret ?? '',
            axis_billing_team_id: settings.axis_billing_team_id ?? '',
            google_oauth_client_id: settings.google_oauth_client_id ?? '',
            google_oauth_client_secret: settings.google_oauth_client_secret ?? '',
            facebook_oauth_client_id: settings.facebook_oauth_client_id ?? '',
            facebook_oauth_client_secret: settings.facebook_oauth_client_secret ?? '',
        },
    });

    const putSection = (section, payload) => {
        router.put(
            '/admin/settings/integration',
            { section, ...payload },
            {
                preserveScroll: true,
                onSuccess: (page) => {
                    const s = page.props.settings;
                    if (!s) {
                        return;
                    }
                    if (section === 'zimra') {
                        form.setFieldValue('zimra_api_url', s.zimra_api_url);
                    } else if (section === 'fiscalcloud') {
                        form.setFieldValue('fiscalcloud_api_url', s.fiscalcloud_api_url);
                        form.setFieldValue('fiscalcloud_api_timeout', s.fiscalcloud_api_timeout);
                        form.setFieldValue('fiscalcloud_api_key', s.fiscalcloud_api_key ?? '');
                    } else if (section === 'docs_ai') {
                        form.setFieldValue('docs_ai_url', s.docs_ai_url ?? '');
                    } else if (section === 'axis_billing') {
                        form.setFieldValue('axis_billing_base_url', s.axis_billing_base_url);
                        form.setFieldValue('axis_billing_api_key', s.axis_billing_api_key);
                        form.setFieldValue('axis_billing_webhook_secret', s.axis_billing_webhook_secret ?? '');
                        form.setFieldValue('axis_billing_team_id', s.axis_billing_team_id ?? '');
                    } else if (section === 'google_oauth') {
                        form.setFieldValue('google_oauth_client_id', s.google_oauth_client_id ?? '');
                        form.setFieldValue('google_oauth_client_secret', s.google_oauth_client_secret ?? '');
                    } else if (section === 'facebook_oauth') {
                        form.setFieldValue('facebook_oauth_client_id', s.facebook_oauth_client_id ?? '');
                        form.setFieldValue('facebook_oauth_client_secret', s.facebook_oauth_client_secret ?? '');
                    }
                },
            }
        );
    };

    return (
        <AdminLayout
            title="Integrations & APIs"
            description="Fiscal providers, billing, and social login credentials. Callback URLs are fixed — copy them into each provider’s console."
        >
            <Paper
                shadow="xs"
                p="lg"
                radius="md"
                withBorder
                w="100%"
                maw="100%"
                style={{ alignSelf: 'stretch', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            >
                <Title order={4} mb="xs">
                    External services
                </Title>
                <Text size="sm" c="dimmed" mb="lg">
                    {envNote}
                </Text>

                <Tabs defaultValue="zimra" keepMounted={false} w="100%">
                    <Tabs.List>
                        <Tabs.Tab value="zimra">ZIMRA (FDMS)</Tabs.Tab>
                        <Tabs.Tab value="fiscalcloud">Fiscal Cloud</Tabs.Tab>
                        <Tabs.Tab value="docs_ai">Docs AI</Tabs.Tab>
                        <Tabs.Tab value="axis_billing">Axis Billing</Tabs.Tab>
                        <Tabs.Tab value="google_oauth">Google OAuth</Tabs.Tab>
                        <Tabs.Tab value="facebook_oauth">Facebook OAuth</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="zimra" pt="lg">
                        <Stack gap="md">
                            <TextInput
                                label="API URL"
                                placeholder="https://… or http://host:port"
                                {...form.getInputProps('zimra_api_url')}
                                error={errors?.zimra_api_url}
                                autoComplete="off"
                            />
                            <Button
                                color="red"
                                w="fit-content"
                                onClick={() =>
                                    putSection('zimra', {
                                        zimra_api_url: form.values.zimra_api_url,
                                    })
                                }
                            >
                                Save ZIMRA settings
                            </Button>
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="fiscalcloud" pt="lg">
                        <Stack gap="md">
                            <TextInput
                                label="API URL"
                                {...form.getInputProps('fiscalcloud_api_url')}
                                error={errors?.fiscalcloud_api_url}
                                autoComplete="off"
                            />
                            <NumberInput
                                label="Timeout (seconds)"
                                min={1}
                                max={600}
                                {...form.getInputProps('fiscalcloud_api_timeout')}
                                error={errors?.fiscalcloud_api_timeout}
                            />
                            <PasswordInput
                                label="X-API-Key"
                                description="Required for Fiscal Cloud e-invoicing company registration."
                                {...form.getInputProps('fiscalcloud_api_key')}
                                error={errors?.fiscalcloud_api_key}
                                autoComplete="off"
                            />
                            <Button
                                color="red"
                                w="fit-content"
                                onClick={() =>
                                    putSection('fiscalcloud', {
                                        fiscalcloud_api_url: form.values.fiscalcloud_api_url,
                                        fiscalcloud_api_timeout: form.values.fiscalcloud_api_timeout,
                                        fiscalcloud_api_key: form.values.fiscalcloud_api_key,
                                    })
                                }
                            >
                                Save Fiscal Cloud settings
                            </Button>
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="docs_ai" pt="lg">
                        <Stack gap="md">
                            <TextInput
                                label="Base URL"
                                description=""
                                {...form.getInputProps('docs_ai_url')}
                                error={errors?.docs_ai_url}
                                autoComplete="off"
                            />
                            <Button
                                color="red"
                                w="fit-content"
                                onClick={() =>
                                    putSection('docs_ai', {
                                        docs_ai_url: form.values.docs_ai_url,
                                    })
                                }
                            >
                                Save Docs AI settings
                            </Button>
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="axis_billing" pt="lg">
                        <Stack gap="md">
                            <TextInput
                                label="Base URL"
                                description="May include /api suffix."
                                {...form.getInputProps('axis_billing_base_url')}
                                error={errors?.axis_billing_base_url}
                                autoComplete="off"
                            />
                            <PasswordInput
                                label="API key (X-API-Key)"
                                {...form.getInputProps('axis_billing_api_key')}
                                error={errors?.axis_billing_api_key}
                                autoComplete="off"
                            />
                            <PasswordInput
                                label="Webhook secret"
                                {...form.getInputProps('axis_billing_webhook_secret')}
                                error={errors?.axis_billing_webhook_secret}
                                autoComplete="off"
                            />
                            <TextInput
                                label="Team ID"
                                description="Optional reference; not sent on API calls by default."
                                {...form.getInputProps('axis_billing_team_id')}
                                error={errors?.axis_billing_team_id}
                                autoComplete="off"
                            />
                            <Button
                                color="red"
                                w="fit-content"
                                onClick={() =>
                                    putSection('axis_billing', {
                                        axis_billing_base_url: form.values.axis_billing_base_url,
                                        axis_billing_api_key: form.values.axis_billing_api_key,
                                        axis_billing_webhook_secret: form.values.axis_billing_webhook_secret,
                                        axis_billing_team_id: form.values.axis_billing_team_id,
                                    })
                                }
                            >
                                Save Axis Billing settings
                            </Button>
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="google_oauth" pt="lg">
                        <Stack gap="md">
                            <Text size="sm" c="dimmed">
                                Register this redirect URI in Google Cloud Console (OAuth 2.0 Client → Authorized redirect
                                URIs).
                            </Text>
                            <TextInput
                                label="Authorized redirect URI (read-only)"
                                readOnly
                                value={oauthCallbackUrls?.google ?? ''}
                                rightSectionWidth={90}
                                rightSection={
                                    <CopyButton value={oauthCallbackUrls?.google ?? ''}>
                                        {({ copied, copy }) => (
                                            <Tooltip label={copied ? 'Copied' : 'Copy URL'}>
                                                <Button variant="light" size="compact-xs" onClick={copy} color={copied ? 'teal' : 'gray'}>
                                                    {copied ? 'Copied' : 'Copy'}
                                                </Button>
                                            </Tooltip>
                                        )}
                                    </CopyButton>
                                }
                            />
                            <TextInput
                                label="Client ID"
                                {...form.getInputProps('google_oauth_client_id')}
                                error={errors?.google_oauth_client_id}
                                autoComplete="off"
                            />
                            <PasswordInput
                                label="Client secret"
                                {...form.getInputProps('google_oauth_client_secret')}
                                error={errors?.google_oauth_client_secret}
                                autoComplete="off"
                            />
                            <Button
                                color="red"
                                w="fit-content"
                                onClick={() =>
                                    putSection('google_oauth', {
                                        google_oauth_client_id: form.values.google_oauth_client_id,
                                        google_oauth_client_secret: form.values.google_oauth_client_secret,
                                    })
                                }
                            >
                                Save Google OAuth
                            </Button>
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="facebook_oauth" pt="lg">
                        <Stack gap="md">
                            <Text size="sm" c="dimmed">
                                Add this Valid OAuth Redirect URI in your Facebook app (Facebook Login → Settings).
                            </Text>
                            <TextInput
                                label="Valid OAuth redirect URI (read-only)"
                                readOnly
                                value={oauthCallbackUrls?.facebook ?? ''}
                                rightSectionWidth={90}
                                rightSection={
                                    <CopyButton value={oauthCallbackUrls?.facebook ?? ''}>
                                        {({ copied, copy }) => (
                                            <Tooltip label={copied ? 'Copied' : 'Copy URL'}>
                                                <Button variant="light" size="compact-xs" onClick={copy} color={copied ? 'teal' : 'gray'}>
                                                    {copied ? 'Copied' : 'Copy'}
                                                </Button>
                                            </Tooltip>
                                        )}
                                    </CopyButton>
                                }
                            />
                            <TextInput
                                label="App ID (Client ID)"
                                {...form.getInputProps('facebook_oauth_client_id')}
                                error={errors?.facebook_oauth_client_id}
                                autoComplete="off"
                            />
                            <PasswordInput
                                label="App secret (Client secret)"
                                {...form.getInputProps('facebook_oauth_client_secret')}
                                error={errors?.facebook_oauth_client_secret}
                                autoComplete="off"
                            />
                            <Button
                                color="red"
                                w="fit-content"
                                onClick={() =>
                                    putSection('facebook_oauth', {
                                        facebook_oauth_client_id: form.values.facebook_oauth_client_id,
                                        facebook_oauth_client_secret: form.values.facebook_oauth_client_secret,
                                    })
                                }
                            >
                                Save Facebook OAuth
                            </Button>
                        </Stack>
                    </Tabs.Panel>
                </Tabs>
            </Paper>
        </AdminLayout>
    );
}
