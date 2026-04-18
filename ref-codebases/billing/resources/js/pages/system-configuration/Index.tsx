import { router } from '@inertiajs/react';
import {
    Alert,
    Button,
    Card,
    Checkbox,
    Group,
    Select,
    Stack,
    Tabs,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconDeviceFloppy,
    IconMail,
    IconPlus,
    IconSettings2,
    IconTrash,
    IconWorld,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import AppShellLayout from '@/layouts/AppShellLayout';

type Props = {
    application: {
        name: string;
        url: string;
        debug: boolean;
        timezone: string;
    };
    mail: {
        default_mailer: string;
        smtp_scheme: string | null;
        smtp_host: string;
        smtp_port: number;
        smtp_username: string | null;
        smtp_password_set: boolean;
        from_address: string;
        from_name: string;
    };
    payment_notifications: {
        notify_on_success: boolean;
        success_notification_emails: string[];
    };
    ecocash: {
        api_url: string;
        notify_url: string;
        username: string;
        password_set: boolean;
        merchant_code: string;
        merchant_pin_set: boolean;
        terminal_id: string;
        location: string;
        super_merchant: string;
        merchant_name: string;
        currency: string;
    };
    zimswitch: {
        base_url: string;
        authorization_token_set: boolean;
        payment_type: string;
        test_mode_header: string | null;
        verify_ssl: boolean;
        timeout: number;
        connect_timeout: number;
        payment_options: Record<string, { label: string; entity_id: string; data_brands: string }>;
    };
    omari: {
        merchant_api_key_set: boolean;
        production: boolean;
        merchant_base_url: string | null;
        timeout: number;
        connect_timeout: number;
    };
};

type PaymentOptionRow = {
    key: string;
    label: string;
    entity_id: string;
    data_brands: string;
};

function useTimezoneSelectData(): { value: string; label: string }[] {
    return useMemo(() => {
        try {
            const ids = Intl.supportedValuesOf('timeZone');
            return ids.map((z) => ({ value: z, label: z }));
        } catch {
            return [
                { value: 'Africa/Harare', label: 'Africa/Harare' },
                { value: 'UTC', label: 'UTC' },
            ];
        }
    }, []);
}

export default function Index({ application, mail, payment_notifications, ecocash, zimswitch, omari }: Props) {
    const timezoneData = useTimezoneSelectData();
    const [busy, setBusy] = useState<
        'application' | 'mail' | 'payment_notifications' | 'ecocash' | 'zimswitch' | 'omari' | null
    >(null);
    const [err, setErr] = useState<string | null>(null);
    const [tab, setTab] = useState<
        'application' | 'mail' | 'payment_notifications' | 'ecocash' | 'zimswitch' | 'omari'
    >('application');

    const [appState, setAppState] = useState({
        name: application.name ?? '',
        url: application.url ?? '',
        debug: !!application.debug,
        timezone: application.timezone ?? 'Africa/Harare',
    });

    const [mailState, setMailState] = useState({
        default_mailer: mail.default_mailer ?? 'log',
        smtp_scheme: mail.smtp_scheme ?? '',
        smtp_host: mail.smtp_host ?? '',
        smtp_port: mail.smtp_port ?? 2525,
        smtp_username: mail.smtp_username ?? '',
        smtp_password: '',
        from_address: mail.from_address ?? '',
        from_name: mail.from_name ?? '',
    });

    const [payNotify, setPayNotify] = useState({
        notify_on_success: !!payment_notifications.notify_on_success,
        success_notification_emails_text: (payment_notifications.success_notification_emails ?? []).join('\n'),
    });

    const [eco, setEco] = useState({
        api_url: ecocash.api_url ?? '',
        notify_url: ecocash.notify_url ?? '',
        username: ecocash.username ?? '',
        password: '',
        merchant_code: ecocash.merchant_code ?? '',
        merchant_pin: '',
        terminal_id: ecocash.terminal_id ?? '',
        location: ecocash.location ?? '',
        super_merchant: ecocash.super_merchant ?? '',
        merchant_name: ecocash.merchant_name ?? '',
        currency: ecocash.currency ?? 'ZWG',
    });

    const [zim, setZim] = useState({
        base_url: zimswitch.base_url ?? '',
        authorization_token: '',
        payment_type: zimswitch.payment_type ?? 'DB',
        test_mode_header: zimswitch.test_mode_header ?? '',
        verify_ssl: !!zimswitch.verify_ssl,
        timeout: zimswitch.timeout ?? 30,
        connect_timeout: zimswitch.connect_timeout ?? 10,
        payment_options: zimswitch.payment_options ?? {},
    });

    const [oma, setOma] = useState({
        merchant_api_key: '',
        production: !!omari.production,
        merchant_base_url: omari.merchant_base_url ?? '',
        timeout: omari.timeout ?? 30,
        connect_timeout: omari.connect_timeout ?? 10,
    });

    const initialPaymentOptionRows = useMemo<PaymentOptionRow[]>(() => {
        const opts = zimswitch.payment_options ?? {};
        const rows = Object.entries(opts).map(([key, v]) => ({
            key,
            label: v?.label ?? '',
            entity_id: v?.entity_id ?? '',
            data_brands: v?.data_brands ?? '',
        }));
        return rows.length > 0
            ? rows
            : [
                  {
                      key: 'visa_master_usd',
                      label: 'Visa / Mastercard (USD)',
                      entity_id: '',
                      data_brands: 'VISA MASTER',
                  },
              ];
    }, [zimswitch.payment_options]);

    const [paymentOptionRows, setPaymentOptionRows] = useState<PaymentOptionRow[]>(initialPaymentOptionRows);

    function save(
        which: 'application' | 'mail' | 'payment_notifications' | 'ecocash' | 'zimswitch' | 'omari',
    ) {
        setBusy(which);
        setErr(null);
        const payload: Record<string, any> = {};

        if (which === 'application') {
            payload.application = {
                name: appState.name,
                url: appState.url,
                debug: appState.debug,
                timezone: appState.timezone,
            };
        }

        if (which === 'mail') {
            payload.mail = {
                ...mailState,
                smtp_scheme: mailState.smtp_scheme.trim() === '' ? null : mailState.smtp_scheme.trim(),
                smtp_username: mailState.smtp_username.trim() === '' ? null : mailState.smtp_username.trim(),
            };
        }

        if (which === 'payment_notifications') {
            const lines = payNotify.success_notification_emails_text
                .split(/[\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean);
            payload.payment_notifications = {
                notify_on_success: payNotify.notify_on_success,
                success_notification_emails: lines,
            };
        }

        if (which === 'ecocash') {
            payload.ecocash = eco;
        }

        if (which === 'zimswitch') {
            const parsedOptions: Record<string, { label: string; entity_id: string; data_brands: string }> = {};
            const keys = new Set<string>();
            for (const row of paymentOptionRows) {
                const k = (row.key || '').trim();
                if (!k) {
                    setErr('Each payment option must have a key.');
                    setBusy(null);
                    return;
                }
                if (keys.has(k)) {
                    setErr(`Duplicate payment option key: ${k}`);
                    setBusy(null);
                    return;
                }
                keys.add(k);
                parsedOptions[k] = {
                    label: (row.label || '').trim(),
                    entity_id: (row.entity_id || '').trim(),
                    data_brands: (row.data_brands || '').trim(),
                };
            }
            payload.zimswitch = {
                ...zim,
                payment_options: parsedOptions,
                test_mode_header: zim.test_mode_header || null,
            };
        }

        if (which === 'omari') {
            payload.omari = {
                ...oma,
                merchant_base_url: oma.merchant_base_url || null,
            };
        }

        router.patch('/system-configuration', payload as any, {
            preserveScroll: true,
            onError: (errors) => {
                const msg =
                    typeof errors === 'object' && errors !== null
                        ? Object.values(errors)
                              .flat()
                              .filter(Boolean)
                              .join(' ')
                        : null;
                setErr(msg || 'Failed to update configuration.');
            },
            onFinish: () => setBusy(null),
        });
    }

    return (
        <AppShellLayout
            title="System Configuration"
            subtitle="Configure application identity, mail, payment notifications, and payment gateways."
        >
            <Stack gap="lg">
                {err && (
                    <Alert color="red" icon={<IconAlertCircle size={16} />}>
                        {err}
                    </Alert>
                )}

                <Tabs value={tab} onChange={(v) => setTab((v ?? 'application') as typeof tab)}>
                    <Tabs.List>
                        <Tabs.Tab value="application">Application</Tabs.Tab>
                        <Tabs.Tab value="mail">Mail</Tabs.Tab>
                        <Tabs.Tab value="payment_notifications">Payment notifications</Tabs.Tab>
                        <Tabs.Tab value="ecocash">EcoCash</Tabs.Tab>
                        <Tabs.Tab value="zimswitch">ZimSwitch / OPPWA</Tabs.Tab>
                        <Tabs.Tab value="omari">Omari</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="application" pt="md">
                        <Card withBorder radius="md" p="md">
                            <Group justify="space-between" gap="sm" mb="xs">
                                <Group gap="xs">
                                    <IconWorld size={18} />
                                    <Title order={3} size="h4">
                                        Application
                                    </Title>
                                </Group>
                                <Button
                                    leftSection={<IconDeviceFloppy size={16} />}
                                    onClick={() => save('application')}
                                    loading={busy === 'application'}
                                >
                                    Save application
                                </Button>
                            </Group>
                            <Stack gap="sm">
                                <Text size="sm" c="dimmed">
                                    Keep <code>APP_KEY</code> and <code>APP_ENV</code> in your <code>.env</code> file — the
                                    encryption key and environment name are read at bootstrap before the database.
                                </Text>
                                <TextInput
                                    label="Application name"
                                    value={appState.name}
                                    onChange={(e) => setAppState({ ...appState, name: e.target.value })}
                                    required
                                />
                                <TextInput
                                    label="Application URL"
                                    description="Base URL (no trailing slash)."
                                    value={appState.url}
                                    onChange={(e) => setAppState({ ...appState, url: e.target.value })}
                                    required
                                />
                                <Checkbox
                                    label="Debug mode"
                                    description="Show detailed errors in the browser. Disable in production."
                                    checked={appState.debug}
                                    onChange={(e) => setAppState({ ...appState, debug: e.currentTarget.checked })}
                                />
                                <Select
                                    label="Timezone"
                                    description="Default for PHP and Carbon; Africa/Harare is Zimbabwe."
                                    searchable
                                    data={timezoneData}
                                    value={appState.timezone}
                                    onChange={(v) => setAppState({ ...appState, timezone: v ?? 'Africa/Harare' })}
                                />
                            </Stack>
                        </Card>
                    </Tabs.Panel>

                    <Tabs.Panel value="mail" pt="md">
                        <Card withBorder radius="md" p="md">
                            <Group justify="space-between" gap="sm" mb="xs">
                                <Group gap="xs">
                                    <IconMail size={18} />
                                    <Title order={3} size="h4">
                                        Outgoing mail
                                    </Title>
                                </Group>
                                <Button
                                    leftSection={<IconDeviceFloppy size={16} />}
                                    onClick={() => save('mail')}
                                    loading={busy === 'mail'}
                                >
                                    Save mail
                                </Button>
                            </Group>
                            <Stack gap="sm">
                                <Select
                                    label="Mailer"
                                    description="Use log or array for local development without SMTP."
                                    data={[
                                        { value: 'smtp', label: 'SMTP' },
                                        { value: 'log', label: 'Log (no delivery)' },
                                        { value: 'array', label: 'Array (tests)' },
                                        { value: 'sendmail', label: 'Sendmail' },
                                    ]}
                                    value={mailState.default_mailer}
                                    onChange={(v) => setMailState({ ...mailState, default_mailer: v ?? 'log' })}
                                />
                                <Text size="xs" c="dimmed">
                                    SMTP host, port, and credentials apply when the mailer is SMTP.
                                </Text>
                                <Group grow>
                                    <TextInput
                                        label="SMTP scheme (optional)"
                                        placeholder="e.g. smtps or leave empty"
                                        value={mailState.smtp_scheme}
                                        onChange={(e) => setMailState({ ...mailState, smtp_scheme: e.target.value })}
                                    />
                                    <TextInput
                                        label="SMTP host"
                                        value={mailState.smtp_host}
                                        onChange={(e) => setMailState({ ...mailState, smtp_host: e.target.value })}
                                        required
                                    />
                                </Group>
                                <TextInput
                                    label="SMTP port"
                                    value={String(mailState.smtp_port)}
                                    onChange={(e) =>
                                        setMailState({ ...mailState, smtp_port: parseInt(e.target.value || '0', 10) || 0 })
                                    }
                                    required
                                />
                                <Group grow>
                                    <TextInput
                                        label="SMTP username"
                                        value={mailState.smtp_username}
                                        onChange={(e) => setMailState({ ...mailState, smtp_username: e.target.value })}
                                    />
                                    <TextInput
                                        label={`SMTP password (${mail.smtp_password_set ? 'set' : 'not set'})`}
                                        type="password"
                                        value={mailState.smtp_password}
                                        onChange={(e) => setMailState({ ...mailState, smtp_password: e.target.value })}
                                        placeholder="Leave blank to keep existing"
                                    />
                                </Group>
                                <Group grow>
                                    <TextInput
                                        label="From address"
                                        type="email"
                                        value={mailState.from_address}
                                        onChange={(e) => setMailState({ ...mailState, from_address: e.target.value })}
                                        required
                                    />
                                    <TextInput
                                        label="From name"
                                        value={mailState.from_name}
                                        onChange={(e) => setMailState({ ...mailState, from_name: e.target.value })}
                                        required
                                    />
                                </Group>
                            </Stack>
                        </Card>
                    </Tabs.Panel>

                    <Tabs.Panel value="payment_notifications" pt="md">
                        <Card withBorder radius="md" p="md">
                            <Group justify="space-between" gap="sm" mb="xs">
                                <Group gap="xs">
                                    <IconMail size={18} />
                                    <Title order={3} size="h4">
                                        Successful payment emails
                                    </Title>
                                </Group>
                                <Button
                                    leftSection={<IconDeviceFloppy size={16} />}
                                    onClick={() => save('payment_notifications')}
                                    loading={busy === 'payment_notifications'}
                                >
                                    Save notifications
                                </Button>
                            </Group>
                            <Stack gap="sm">
                                <Checkbox
                                    label="Send email when a payment succeeds"
                                    checked={payNotify.notify_on_success}
                                    onChange={(e) =>
                                        setPayNotify({ ...payNotify, notify_on_success: e.currentTarget.checked })
                                    }
                                />
                                <Textarea
                                    label="Notification recipients"
                                    description="One email address per line (or comma-separated). These addresses receive payment details when a payment is recorded as successful."
                                    minRows={4}
                                    value={payNotify.success_notification_emails_text}
                                    onChange={(e) =>
                                        setPayNotify({ ...payNotify, success_notification_emails_text: e.target.value })
                                    }
                                />
                            </Stack>
                        </Card>
                    </Tabs.Panel>

                    <Tabs.Panel value="ecocash" pt="md">
                        <Card withBorder radius="md" p="md">
                            <Group justify="space-between" gap="sm" mb="xs">
                                <Group gap="xs">
                                    <IconSettings2 size={18} />
                                    <Title order={3} size="h4">
                                        EcoCash
                                    </Title>
                                </Group>
                                <Button
                                    leftSection={<IconDeviceFloppy size={16} />}
                                    onClick={() => save('ecocash')}
                                    loading={busy === 'ecocash'}
                                >
                                    Save EcoCash
                                </Button>
                            </Group>
                            <Stack gap="sm">
                                <TextInput label="API URL" value={eco.api_url} onChange={(e) => setEco({ ...eco, api_url: e.target.value })} required />
                                <TextInput label="Notify URL" value={eco.notify_url} onChange={(e) => setEco({ ...eco, notify_url: e.target.value })} required />
                                <Group grow>
                                    <TextInput label="Username" value={eco.username} onChange={(e) => setEco({ ...eco, username: e.target.value })} required />
                                    <TextInput
                                        label={`Password (${ecocash.password_set ? 'set' : 'not set'})`}
                                        type="password"
                                        value={eco.password}
                                        onChange={(e) => setEco({ ...eco, password: e.target.value })}
                                        placeholder="Leave blank to keep existing"
                                    />
                                </Group>
                                <Group grow>
                                    <TextInput label="Merchant code" value={eco.merchant_code} onChange={(e) => setEco({ ...eco, merchant_code: e.target.value })} required />
                                    <TextInput
                                        label={`Merchant PIN (${ecocash.merchant_pin_set ? 'set' : 'not set'})`}
                                        type="password"
                                        value={eco.merchant_pin}
                                        onChange={(e) => setEco({ ...eco, merchant_pin: e.target.value })}
                                        placeholder="Leave blank to keep existing"
                                    />
                                </Group>
                                <Group grow>
                                    <TextInput label="Terminal ID" value={eco.terminal_id} onChange={(e) => setEco({ ...eco, terminal_id: e.target.value })} required />
                                    <TextInput label="Currency" value={eco.currency} onChange={(e) => setEco({ ...eco, currency: e.target.value.toUpperCase() })} required />
                                </Group>
                                <TextInput label="Location" value={eco.location} onChange={(e) => setEco({ ...eco, location: e.target.value })} required />
                                <TextInput label="Super merchant" value={eco.super_merchant} onChange={(e) => setEco({ ...eco, super_merchant: e.target.value })} required />
                                <TextInput label="Merchant name" value={eco.merchant_name} onChange={(e) => setEco({ ...eco, merchant_name: e.target.value })} required />
                            </Stack>
                        </Card>
                    </Tabs.Panel>

                    <Tabs.Panel value="zimswitch" pt="md">
                        <Card withBorder radius="md" p="md">
                            <Group justify="space-between" gap="sm" mb="xs">
                                <Group gap="xs">
                                    <IconSettings2 size={18} />
                                    <Title order={3} size="h4">
                                        ZimSwitch / OPPWA
                                    </Title>
                                </Group>
                                <Button
                                    leftSection={<IconDeviceFloppy size={16} />}
                                    onClick={() => save('zimswitch')}
                                    loading={busy === 'zimswitch'}
                                >
                                    Save ZimSwitch
                                </Button>
                            </Group>
                            <Stack gap="sm">
                                <TextInput label="Base URL" value={zim.base_url} onChange={(e) => setZim({ ...zim, base_url: e.target.value })} required />
                                <TextInput
                                    label={`Authorization token (${zimswitch.authorization_token_set ? 'set' : 'not set'})`}
                                    type="password"
                                    value={zim.authorization_token}
                                    onChange={(e) => setZim({ ...zim, authorization_token: e.target.value })}
                                    placeholder="Leave blank to keep existing"
                                />
                                <Group grow>
                                    <TextInput label="Payment type" value={zim.payment_type} onChange={(e) => setZim({ ...zim, payment_type: e.target.value })} required />
                                    <TextInput label="Test mode header (optional)" value={zim.test_mode_header} onChange={(e) => setZim({ ...zim, test_mode_header: e.target.value })} />
                                </Group>
                                <Group grow>
                                    <TextInput label="Timeout (seconds)" value={String(zim.timeout)} onChange={(e) => setZim({ ...zim, timeout: parseInt(e.target.value || '0', 10) })} />
                                    <TextInput label="Connect timeout (seconds)" value={String(zim.connect_timeout)} onChange={(e) => setZim({ ...zim, connect_timeout: parseInt(e.target.value || '0', 10) })} />
                                </Group>
                                <Checkbox
                                    label="Verify SSL"
                                    checked={zim.verify_ssl}
                                    onChange={(e) => setZim({ ...zim, verify_ssl: e.currentTarget.checked })}
                                />

                                <Stack gap="xs">
                                    <Group justify="space-between" align="flex-end" wrap="wrap">
                                        <div>
                                            <Text fw={600}>Payment options</Text>
                                            <Text size="xs" c="dimmed">
                                                These drive the checkout buttons.
                                            </Text>
                                        </div>
                                        <Button
                                            variant="light"
                                            leftSection={<IconPlus size={16} />}
                                            onClick={() =>
                                                setPaymentOptionRows([
                                                    ...paymentOptionRows,
                                                    { key: '', label: '', entity_id: '', data_brands: '' },
                                                ])
                                            }
                                        >
                                            Add option
                                        </Button>
                                    </Group>

                                    <Stack gap="sm">
                                        {paymentOptionRows.map((row, idx) => (
                                            <Card key={`${idx}-${row.key}`} withBorder radius="md" p="sm">
                                                <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
                                                    <Text fw={600} size="sm">
                                                        Option {idx + 1}
                                                    </Text>
                                                    <Button
                                                        color="red"
                                                        variant="subtle"
                                                        leftSection={<IconTrash size={16} />}
                                                        disabled={paymentOptionRows.length <= 1}
                                                        onClick={() =>
                                                            setPaymentOptionRows(paymentOptionRows.filter((_, i) => i !== idx))
                                                        }
                                                    >
                                                        Remove
                                                    </Button>
                                                </Group>

                                                <Stack gap="sm">
                                                    <TextInput
                                                        label="Key"
                                                        description="Internal identifier (e.g. visa_master_usd)"
                                                        value={row.key}
                                                        onChange={(e) => {
                                                            const next = [...paymentOptionRows];
                                                            next[idx] = { ...row, key: e.target.value };
                                                            setPaymentOptionRows(next);
                                                        }}
                                                        required
                                                    />
                                                    <Group grow>
                                                        <TextInput
                                                            label="Label"
                                                            value={row.label}
                                                            onChange={(e) => {
                                                                const next = [...paymentOptionRows];
                                                                next[idx] = { ...row, label: e.target.value };
                                                                setPaymentOptionRows(next);
                                                            }}
                                                            required
                                                        />
                                                        <TextInput
                                                            label="Entity ID"
                                                            value={row.entity_id}
                                                            onChange={(e) => {
                                                                const next = [...paymentOptionRows];
                                                                next[idx] = { ...row, entity_id: e.target.value };
                                                                setPaymentOptionRows(next);
                                                            }}
                                                            required
                                                        />
                                                    </Group>
                                                    <TextInput
                                                        label="Data brands"
                                                        description="Space-separated brands (e.g. VISA MASTER) or PRIVATE_LABEL"
                                                        value={row.data_brands}
                                                        onChange={(e) => {
                                                            const next = [...paymentOptionRows];
                                                            next[idx] = { ...row, data_brands: e.target.value };
                                                            setPaymentOptionRows(next);
                                                        }}
                                                        required
                                                    />
                                                </Stack>
                                            </Card>
                                        ))}
                                    </Stack>
                                </Stack>
                            </Stack>
                        </Card>
                    </Tabs.Panel>

                    <Tabs.Panel value="omari" pt="md">
                        <Card withBorder radius="md" p="md">
                            <Group justify="space-between" gap="sm" mb="xs">
                                <Group gap="xs">
                                    <IconSettings2 size={18} />
                                    <Title order={3} size="h4">
                                        Omari
                                    </Title>
                                </Group>
                                <Button
                                    leftSection={<IconDeviceFloppy size={16} />}
                                    onClick={() => save('omari')}
                                    loading={busy === 'omari'}
                                >
                                    Save Omari
                                </Button>
                            </Group>
                            <Stack gap="sm">
                                <TextInput
                                    label={`Merchant API key (${omari.merchant_api_key_set ? 'set' : 'not set'})`}
                                    type="password"
                                    value={oma.merchant_api_key}
                                    onChange={(e) => setOma({ ...oma, merchant_api_key: e.target.value })}
                                    placeholder="Leave blank to keep existing"
                                />
                                <Checkbox
                                    label="Production"
                                    checked={oma.production}
                                    onChange={(e) => setOma({ ...oma, production: e.currentTarget.checked })}
                                />
                                <TextInput
                                    label="Merchant base URL override (optional)"
                                    value={oma.merchant_base_url}
                                    onChange={(e) => setOma({ ...oma, merchant_base_url: e.target.value })}
                                />
                                <Group grow>
                                    <TextInput label="Timeout (seconds)" value={String(oma.timeout)} onChange={(e) => setOma({ ...oma, timeout: parseInt(e.target.value || '0', 10) })} />
                                    <TextInput label="Connect timeout (seconds)" value={String(oma.connect_timeout)} onChange={(e) => setOma({ ...oma, connect_timeout: parseInt(e.target.value || '0', 10) })} />
                                </Group>
                                <Text size="xs" c="dimmed">
                                    Omari uses UAT/Prod defaults unless a base URL override is set.
                                </Text>
                            </Stack>
                        </Card>
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </AppShellLayout>
    );
}

