import { Badge, Button, Group, Paper, Table } from '@mantine/core';
import { Link, router } from '@inertiajs/react';
import { RiEyeLine, RiPencilLine, RiStopCircleLine } from 'react-icons/ri';
import AdminLayout from '../../../Layouts/AdminLayout';
import TableControls from '../../../Components/Admin/TableControls';

export default function Index({ companies, filters }) {
    const { data, current_page, last_page, total } = companies;

    return (
        <AdminLayout title="Companies">
            <Paper shadow="xs" p="md" radius="md" withBorder>
                <TableControls
                    baseUrl="/admin/companies"
                    filters={filters}
                    total={total}
                    lastPage={last_page}
                    currentPage={current_page}
                >
                    <Table striped highlightOnHover withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Legal name</Table.Th>
                                <Table.Th>Trade name</Table.Th>
                                <Table.Th>TIN</Table.Th>
                                <Table.Th>VAT</Table.Th>
                                <Table.Th>Email</Table.Th>
                                <Table.Th>Active</Table.Th>
                                <Table.Th>Created</Table.Th>
                                <Table.Th style={{ width: 230 }}>Actions</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {data.map((row) => (
                                <Table.Tr key={row.id}>
                                    <Table.Td>{row.legal_name}</Table.Td>
                                    <Table.Td>{row.trade_name ?? '—'}</Table.Td>
                                    <Table.Td>{row.tin}</Table.Td>
                                    <Table.Td>{row.vat_number ?? '—'}</Table.Td>
                                    <Table.Td>{row.email ?? '—'}</Table.Td>
                                    <Table.Td>
                                        <Badge color={row.is_active ? 'green' : 'gray'}>{row.is_active ? 'Yes' : 'No'}</Badge>
                                    </Table.Td>
                                    <Table.Td>{row.created_at?.slice?.(0, 10) ?? '—'}</Table.Td>
                                    <Table.Td>
                                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                                            <Button
                                                component={Link}
                                                href={`/admin/companies/${row.id}`}
                                                size="compact-sm"
                                                variant="light"
                                                color="gray"
                                                radius="md"
                                                leftSection={<RiEyeLine size={14} />}
                                            >
                                                View
                                            </Button>
                                            <Button
                                                component={Link}
                                                href={`/admin/companies/${row.id}/edit`}
                                                size="compact-sm"
                                                variant="light"
                                                color="gray"
                                                radius="md"
                                                leftSection={<RiPencilLine size={14} />}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                size="compact-sm"
                                                variant="light"
                                                color="red"
                                                radius="md"
                                                leftSection={<RiStopCircleLine size={14} />}
                                                disabled={!row.is_active}
                                                onClick={() => {
                                                    if (!confirm('Disable this company? This will also disable linked users/devices.')) return;
                                                    router.delete(`/admin/companies/${row.id}`, { preserveScroll: true });
                                                }}
                                            >
                                                Disable
                                            </Button>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </TableControls>
            </Paper>
        </AdminLayout>
    );
}
