import { Badge, Button, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { Link, router } from '@inertiajs/react';
import AdminLayout from '../../../Layouts/AdminLayout';

function statusColor(s) {
    const v = (s || '').toUpperCase();
    if (v === 'ACTIVATED') return 'green';
    if (v === 'FAILED') return 'red';
    if (v === 'PROCESSING') return 'yellow';
    if (v === 'PENDING') return 'gray';
    return 'gray';
}

export default function Show({ device }) {
    const canRetry = (device.activation_status || '').toUpperCase() === 'FAILED';

    return (
        <AdminLayout title="Device" description="Full activation and payload details for a company device.">
            <Group mb="md">
                <Button component={Link} href="/admin/devices" variant="default">
                    Back to devices
                </Button>
                {device.company?.id ? (
                    <Button component={Link} href={`/admin/companies/${device.company.id}`} variant="light" color="gray">
                        View company
                    </Button>
                ) : null}
                {canRetry ? (
                    <Button
                        color="red"
                        variant="light"
                        onClick={() => {
                            router.post(`/admin/devices/${device.id}/retry-activation`, {}, { preserveScroll: true });
                        }}
                    >
                        Retry activation
                    </Button>
                ) : null}
            </Group>

            <Stack gap="lg">
                <Paper shadow="sm" p="lg" radius="lg" withBorder>
                    <Group justify="space-between" mb="sm" wrap="wrap">
                        <Title order={5}>Summary</Title>
                        <Badge variant="light" radius="sm" color={statusColor(device.activation_status)}>
                            {device.activation_status ?? '—'}
                        </Badge>
                    </Group>
                    <Table withTableBorder>
                        <Table.Tbody>
                            <Table.Tr>
                                <Table.Td w={200}>
                                    <Text size="sm" c="dimmed">
                                        Company
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    {device.company?.trade_name ?? device.company?.legal_name ?? '—'}{' '}
                                    <Text span c="dimmed" size="sm">
                                        ({device.company?.tin ?? '—'})
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Device name
                                    </Text>
                                </Table.Td>
                                <Table.Td>{device.device_name ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Fiscal device id
                                    </Text>
                                </Table.Td>
                                <Table.Td>{device.fiscal_device_id ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Device serial no
                                    </Text>
                                </Table.Td>
                                <Table.Td>{device.device_serial_no ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        ZIMRA device id
                                    </Text>
                                </Table.Td>
                                <Table.Td>{device.zimra_device_id ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        ZIMRA activation key
                                    </Text>
                                </Table.Td>
                                <Table.Td>{device.zimra_activation_key ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Environment
                                    </Text>
                                </Table.Td>
                                <Table.Td>{device.zimra_environment ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Activated at
                                    </Text>
                                </Table.Td>
                                <Table.Td>{device.fiscal_cloud_activated_at?.slice?.(0, 19)?.replace('T', ' ') ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Activation attempted at
                                    </Text>
                                </Table.Td>
                                <Table.Td>{device.activation_attempted_at?.slice?.(0, 19)?.replace('T', ' ') ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Activation error
                                    </Text>
                                </Table.Td>
                                <Table.Td>{device.activation_error ?? '—'}</Table.Td>
                            </Table.Tr>
                        </Table.Tbody>
                    </Table>
                </Paper>

                <Paper shadow="sm" p="lg" radius="lg" withBorder>
                    <Title order={5} mb="sm">
                        Payloads
                    </Title>
                    <Stack gap="sm">
                        <div>
                            <Text size="sm" fw={600} mb={6}>
                                Fiscal Cloud device payload
                            </Text>
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
                                {JSON.stringify(device.fiscal_cloud_payload ?? null, null, 2)}
                            </pre>
                        </div>
                        <div>
                            <Text size="sm" fw={600} mb={6}>
                                ZIMRA (Docs AI) payload
                            </Text>
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
                                {JSON.stringify(device.zimra_payload ?? null, null, 2)}
                            </pre>
                        </div>
                        <div>
                            <Text size="sm" fw={600} mb={6}>
                                Fiscal Cloud activation payload
                            </Text>
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
                                {JSON.stringify(device.fiscal_cloud_activation_payload ?? null, null, 2)}
                            </pre>
                        </div>
                    </Stack>
                </Paper>
            </Stack>
        </AdminLayout>
    );
}

