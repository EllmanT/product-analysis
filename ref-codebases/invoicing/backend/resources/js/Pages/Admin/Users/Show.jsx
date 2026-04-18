import { Badge, Button, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { Link, router } from '@inertiajs/react';
import { RiPencilLine, RiStopCircleLine } from 'react-icons/ri';
import AdminLayout from '../../../Layouts/AdminLayout';

export default function Show({ user }) {
    return (
        <AdminLayout title="User" description="User profile, company link, and status.">
            <Group justify="space-between" mb="md" wrap="wrap">
                <Group gap="sm" wrap="wrap">
                    <Badge variant="light" color={user.is_active ? 'green' : 'gray'} radius="sm">
                        {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant="light" color="gray" radius="sm">
                        {user.role}
                    </Badge>
                    <Text size="sm" c="dimmed">
                        Created: {user.created_at?.slice?.(0, 10) ?? '—'}
                    </Text>
                </Group>
                <Group gap="xs" wrap="wrap">
                    <Button
                        component={Link}
                        href={`/admin/users/${user.id}/edit`}
                        variant="light"
                        color="gray"
                        radius="md"
                        leftSection={<RiPencilLine size={16} />}
                        disabled={user.role === 'SUPER_ADMIN'}
                    >
                        Edit
                    </Button>
                    <Button
                        variant="light"
                        color="red"
                        radius="md"
                        leftSection={<RiStopCircleLine size={16} />}
                        disabled={user.role === 'SUPER_ADMIN' || !user.is_active}
                        onClick={() => {
                            if (!confirm('Disable this user?')) return;
                            router.delete(`/admin/users/${user.id}`);
                        }}
                    >
                        Disable
                    </Button>
                </Group>
            </Group>

            <Stack gap="lg">
                <Paper shadow="sm" p="lg" radius="lg" withBorder>
                    <Title order={5} mb="sm">
                        User details
                    </Title>
                    <Table withTableBorder>
                        <Table.Tbody>
                            <Table.Tr>
                                <Table.Td w={180}>
                                    <Text size="sm" c="dimmed">
                                        Name
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    {user.first_name} {user.last_name}
                                </Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Email
                                    </Text>
                                </Table.Td>
                                <Table.Td>{user.email}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Phone
                                    </Text>
                                </Table.Td>
                                <Table.Td>{user.phone ?? '—'}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        Company
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    {user.company ? (
                                        <Button component={Link} href={`/admin/companies/${user.company.id}`} variant="subtle" color="gray" size="compact-sm">
                                            {user.company.legal_name}
                                        </Button>
                                    ) : (
                                        '—'
                                    )}
                                </Table.Td>
                            </Table.Tr>
                        </Table.Tbody>
                    </Table>
                </Paper>
            </Stack>
        </AdminLayout>
    );
}

