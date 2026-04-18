import { Badge, Button, Group, Paper, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { Link, router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { RiEyeLine } from 'react-icons/ri';
import AdminLayout from '../../../Layouts/AdminLayout';
import TableControls from '../../../Components/Admin/TableControls';

function statusColor(s) {
    const v = (s || '').toUpperCase();
    if (v === 'ACTIVATED') return 'green';
    if (v === 'FAILED') return 'red';
    if (v === 'PROCESSING') return 'yellow';
    if (v === 'PENDING') return 'gray';
    return 'gray';
}

export default function Index({ devices, filters }) {
    const { data, current_page, last_page, total } = devices;
    const [status, setStatus] = useState(filters.status ?? '');

    useEffect(() => {
        setStatus(filters.status ?? '');
    }, [filters.status]);

    const setFilter = (next) => {
        router.get(
            '/admin/devices',
            {
                q: filters.q ?? '',
                per_page: filters.per_page ?? 10,
                status: next || '',
                page: 1,
            },
            { preserveState: true, replace: true }
        );
    };

    return (
        <AdminLayout title="Devices" description="Fiscal Cloud devices and activation status across companies.">
            <Paper shadow="sm" p="lg" radius="lg" withBorder>
                <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
                    <Text size="sm" c="dimmed" maw={560} style={{ lineHeight: 1.5 }}>
                        Filter by activation status and search by company name/TIN, device name, serial, or ids.
                    </Text>
                    <SegmentedControl
                        value={status || 'ALL'}
                        onChange={(v) => {
                            const next = v === 'ALL' ? '' : v;
                            setStatus(next);
                            setFilter(next);
                        }}
                        data={[
                            { label: 'All', value: 'ALL' },
                            { label: 'Activated', value: 'ACTIVATED' },
                            { label: 'Failed', value: 'FAILED' },
                            { label: 'Pending', value: 'PENDING' },
                            { label: 'Processing', value: 'PROCESSING' },
                        ]}
                    />
                </Group>

                <TableControls
                    baseUrl="/admin/devices"
                    filters={filters}
                    total={total}
                    lastPage={last_page}
                    currentPage={current_page}
                >
                    <Table striped highlightOnHover withTableBorder verticalSpacing="sm" horizontalSpacing="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Company</Table.Th>
                                <Table.Th>Device</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Activated at</Table.Th>
                                <Table.Th>Last error</Table.Th>
                                <Table.Th style={{ width: 120 }}>Actions</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {data.length === 0 ? (
                                <Table.Tr>
                                    <Table.Td colSpan={6}>
                                        <Stack align="center" py={28} gap={4}>
                                            <Text fw={600}>No devices match your filters</Text>
                                            <Text size="sm" c="dimmed">
                                                Try another status or search query.
                                            </Text>
                                        </Stack>
                                    </Table.Td>
                                </Table.Tr>
                            ) : (
                                data.map((row) => (
                                    <Table.Tr key={row.id}>
                                        <Table.Td>
                                            <Text size="sm" fw={600}>
                                                {row.company?.trade_name ?? row.company?.legal_name ?? '—'}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {row.company?.tin ?? '—'}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" fw={600}>
                                                {row.device_name ?? '—'}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                Fiscal: {row.fiscal_device_id ?? '—'} · Serial: {row.device_serial_no ?? '—'}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge variant="light" radius="sm" color={statusColor(row.activation_status)}>
                                                {row.activation_status ?? '—'}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {row.fiscal_cloud_activated_at?.slice?.(0, 19)?.replace('T', ' ') ?? '—'}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed" lineClamp={2}>
                                                {row.activation_error ?? '—'}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Button
                                                component={Link}
                                                href={`/admin/devices/${row.id}`}
                                                size="compact-sm"
                                                variant="light"
                                                color="gray"
                                                radius="md"
                                                leftSection={<RiEyeLine size={14} />}
                                            >
                                                View
                                            </Button>
                                        </Table.Td>
                                    </Table.Tr>
                                ))
                            )}
                        </Table.Tbody>
                    </Table>
                </TableControls>
            </Paper>
        </AdminLayout>
    );
}

