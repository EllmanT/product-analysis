import { Badge, Button, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { Link, router } from '@inertiajs/react';
import { RiPencilLine, RiStopCircleLine } from 'react-icons/ri';
import AdminLayout from '../../../Layouts/AdminLayout';

export default function Show({ company, device, users }) {
    return (
        <AdminLayout title="Company" description="Full company profile and recent linked users/devices.">
            <Group justify="space-between" mb="md" wrap="wrap">
                <Group gap="sm" wrap="wrap">
                    <Badge color={company.is_active ? 'green' : 'gray'} variant="light" radius="sm">
                        {company.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Text size="sm" c="dimmed">
                        Created: {company.created_at?.slice?.(0, 10) ?? '—'}
                    </Text>
                </Group>
                <Group gap="xs" wrap="wrap">
                    <Button
                        component={Link}
                        href={`/admin/companies/${company.id}/edit`}
                        variant="light"
                        color="gray"
                        radius="md"
                        leftSection={<RiPencilLine size={16} />}
                    >
                        Edit
                    </Button>
                    <Button
                        variant="light"
                        color="red"
                        radius="md"
                        leftSection={<RiStopCircleLine size={16} />}
                        disabled={!company.is_active}
                        onClick={() => {
                            if (!confirm('Disable this company? This will also disable linked users/devices.')) return;
                            router.delete(`/admin/companies/${company.id}`);
                        }}
                    >
                        Disable
                    </Button>
                </Group>
            </Group>

            <Stack gap="lg">
                <Paper shadow="sm" p="lg" radius="lg" withBorder>
                    <Title order={5} mb="sm">
                        Company details
                    </Title>
                    <Table withTableBorder>
                        <Table.Tbody>
                            <Table.Tr>
                                <Table.Td w={180}>
                                    <Text size="sm" c="dimmed">
                                        Legal name
                                    </Text>
                                </Table.Td>
                                <Table.Td>{company.legal_name}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Trade name
                                    </Text>
                                </Table.Td>
                                <Table.Td>{company.trade_name ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        TIN
                                    </Text>
                                </Table.Td>
                                <Table.Td>{company.tin}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        VAT
                                    </Text>
                                </Table.Td>
                                <Table.Td>{company.vat_number ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Email
                                    </Text>
                                </Table.Td>
                                <Table.Td>{company.email ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Phone
                                    </Text>
                                </Table.Td>
                                <Table.Td>{company.phone ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Region / Station
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    {(company.region ?? '—') + ' / ' + (company.station ?? '—')}
                                </Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Province / City
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    {(company.province ?? '—') + ' / ' + (company.city ?? '—')}
                                </Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Address
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    {(company.house_number ?? '—') + ' ' + (company.address_line ?? '')}
                                </Table.Td>
                            </Table.Tr>
                        </Table.Tbody>
                    </Table>
                </Paper>

                <Paper shadow="sm" p="lg" radius="lg" withBorder>
                    <Title order={5} mb="sm">
                        Device
                    </Title>
                    {device ? (
                        <Table withTableBorder>
                            <Table.Tbody>
                                <Table.Tr>
                                    <Table.Td w={180}>
                                        <Text size="sm" c="dimmed">
                                            Name
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
                                            Serial
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>{device.device_serial_no ?? '—'}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            Activation status
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge variant="light" color={device.activation_status === 'FAILED' ? 'red' : device.activation_status === 'ACTIVATED' ? 'green' : 'yellow'}>
                                            {device.activation_status ?? '—'}
                                        </Badge>
                                    </Table.Td>
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
                    ) : (
                        <Text size="sm" c="dimmed">
                            No device linked.
                        </Text>
                    )}
                </Paper>

                <Paper shadow="sm" p="lg" radius="lg" withBorder>
                    <Title order={5} mb="sm">
                        Recent users
                    </Title>
                    <Table striped highlightOnHover withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Name</Table.Th>
                                <Table.Th>Email</Table.Th>
                                <Table.Th>Role</Table.Th>
                                <Table.Th>Active</Table.Th>
                                <Table.Th>Created</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {(users ?? []).map((u) => (
                                <Table.Tr key={u.id}>
                                    <Table.Td>
                                        {u.first_name} {u.last_name}
                                    </Table.Td>
                                    <Table.Td>{u.email}</Table.Td>
                                    <Table.Td>
                                        <Badge variant="light" color="gray">
                                            {u.role}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge variant="light" color={u.is_active ? 'green' : 'gray'}>
                                            {u.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>{u.created_at?.slice?.(0, 10) ?? '—'}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Paper>
            </Stack>
        </AdminLayout>
    );
}

