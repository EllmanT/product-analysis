import {
    Avatar,
    Badge,
    Button,
    CopyButton,
    Group,
    Modal,
    Paper,
    PasswordInput,
    Stack,
    Table,
    Text,
    ThemeIcon,
} from '@mantine/core';
import { Link, router, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { RiAddLine, RiEyeLine, RiKey2Line, RiLockPasswordLine, RiPencilLine, RiStopCircleLine } from 'react-icons/ri';
import AdminLayout from '../../../Layouts/AdminLayout';
import TableControls from '../../../Components/Admin/TableControls';

function initials(first, last, email) {
    const a = (first || '').trim().charAt(0);
    const b = (last || '').trim().charAt(0);
    if (a && b) {
        return (a + b).toUpperCase();
    }
    if (a) {
        return a.toUpperCase();
    }
    return (email || '?').charAt(0).toUpperCase();
}

export default function Index({ users, filters }) {
    const { data, current_page, last_page, total } = users;
    const { flash } = usePage().props;
    const [issuedCode, setIssuedCode] = useState(null);
    const [resetUser, setResetUser] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');

    useEffect(() => {
        if (flash?.success && !flash?.activation_code_plain) {
            notifications.show({ title: 'Done', message: flash.success, color: 'green' });
        }
    }, [flash?.success, flash?.activation_code_plain]);

    useEffect(() => {
        if (flash?.error) {
            notifications.show({ title: 'Error', message: flash.error, color: 'red' });
        }
    }, [flash?.error]);

    useEffect(() => {
        if (flash?.activation_code_plain) {
            setIssuedCode(flash.activation_code_plain);
        }
    }, [flash?.activation_code_plain]);

    const issueCode = (userId) => {
        router.post(`/admin/users/${userId}/activation-code`, {}, { preserveScroll: true });
    };

    const openReset = (user) => {
        setResetUser(user);
        setNewPassword('');
        setNewPasswordConfirmation('');
    };

    const submitReset = () => {
        if (!resetUser?.id) return;
        router.put(
            `/admin/users/${resetUser.id}/password`,
            { password: newPassword, password_confirmation: newPasswordConfirmation },
            { preserveScroll: true, onSuccess: () => setResetUser(null) }
        );
    };

    return (
        <AdminLayout
            title="Users"
            description="Tenant accounts, roles, and optional company links. Issue activation codes for users who belong to a company."
        >
            <Modal opened={!!issuedCode} onClose={() => setIssuedCode(null)} title="Activation code issued" centered radius="lg">
                <Text size="sm" c="dimmed" mb="md">
                    Copy and send this code securely to the user (e.g. for WhatsApp). It will not be shown again after you close this dialog.
                </Text>
                <Group align="flex-end" wrap="nowrap">
                    <Text ff="monospace" size="lg" fw={700} style={{ letterSpacing: '0.15em' }}>
                        {issuedCode}
                    </Text>
                    {issuedCode && (
                        <CopyButton value={issuedCode}>
                            {({ copied, copy }) => (
                                <Button color={copied ? 'teal' : 'red'} onClick={copy} radius="md">
                                    {copied ? 'Copied' : 'Copy'}
                                </Button>
                            )}
                        </CopyButton>
                    )}
                </Group>
            </Modal>

            <Modal
                opened={!!resetUser}
                onClose={() => setResetUser(null)}
                title="Reset password"
                centered
                radius="lg"
            >
                <Text size="sm" c="dimmed" mb="md">
                    Set a new password for <strong>{resetUser?.email}</strong>. This will immediately replace the existing password.
                </Text>
                <Stack gap="sm">
                    <PasswordInput
                        label="New password"
                        required
                        withAsterisk
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.currentTarget.value)}
                        autoComplete="new-password"
                    />
                    <PasswordInput
                        label="Confirm new password"
                        required
                        withAsterisk
                        value={newPasswordConfirmation}
                        onChange={(e) => setNewPasswordConfirmation(e.currentTarget.value)}
                        autoComplete="new-password"
                    />
                    <Group justify="space-between" mt="md">
                        <Button variant="default" onClick={() => setResetUser(null)}>
                            Cancel
                        </Button>
                        <Button color="red" leftSection={<RiLockPasswordLine size={16} />} onClick={submitReset}>
                            Reset password
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Paper shadow="sm" p="lg" radius="lg" withBorder>
                <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
                    <Text size="sm" c="dimmed" maw={520} style={{ lineHeight: 1.5 }}>
                        Search by name, email, or phone. Super admins never appear in tenant flows; create standard admins and users here.
                    </Text>
                    <Button component={Link} href="/admin/users/create" leftSection={<RiAddLine size={18} />} color="red" radius="md">
                        Add user
                    </Button>
                </Group>
                <TableControls
                    baseUrl="/admin/users"
                    filters={filters}
                    total={total}
                    lastPage={last_page}
                    currentPage={current_page}
                >
                    {data.length === 0 ? (
                        <Stack align="center" py={48} gap="xs">
                            <ThemeIcon size={56} radius="xl" variant="light" color="gray">
                                <RiAddLine size={28} />
                            </ThemeIcon>
                            <Text fw={600}>No users match your search</Text>
                            <Text size="sm" c="dimmed" ta="center" maw={360}>
                                Try another query or add a user to get started.
                            </Text>
                            <Button component={Link} href="/admin/users/create" variant="light" color="red" radius="md" mt="xs">
                                Add user
                            </Button>
                        </Stack>
                    ) : (
                        <Table striped highlightOnHover withTableBorder verticalSpacing="sm" horizontalSpacing="md">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>User</Table.Th>
                                    <Table.Th>Company</Table.Th>
                                    <Table.Th>Role</Table.Th>
                                    <Table.Th>Active</Table.Th>
                                    <Table.Th>Created</Table.Th>
                                    <Table.Th style={{ width: 260 }}>Actions</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {data.map((row) => (
                                    <Table.Tr key={row.id}>
                                        <Table.Td>
                                            <Group gap="sm" wrap="nowrap">
                                                <Avatar color="red" radius="xl" size="md">
                                                    {initials(row.first_name, row.last_name, row.email)}
                                                </Avatar>
                                                <div>
                                                    <Text size="sm" fw={600}>
                                                        {row.first_name} {row.last_name}
                                                    </Text>
                                                    <Text size="xs" c="dimmed">
                                                        {row.email}
                                                    </Text>
                                                </div>
                                            </Group>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm">{row.company?.legal_name ?? '—'}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge variant="light" color={row.role === 'SUPER_ADMIN' ? 'red' : 'gray'} radius="sm">
                                                {row.role}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge variant="light" color={row.is_active ? 'green' : 'gray'} radius="sm">
                                                {row.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {row.created_at?.slice?.(0, 10) ?? '—'}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                <Button
                                                    component={Link}
                                                    href={`/admin/users/${row.id}`}
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
                                                    href={`/admin/users/${row.id}/edit`}
                                                    size="compact-sm"
                                                    variant="light"
                                                    color="gray"
                                                    radius="md"
                                                    leftSection={<RiPencilLine size={14} />}
                                                    disabled={row.role === 'SUPER_ADMIN'}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="compact-sm"
                                                    variant="light"
                                                    color="red"
                                                    radius="md"
                                                    leftSection={<RiStopCircleLine size={14} />}
                                                    disabled={row.role === 'SUPER_ADMIN' || !row.is_active}
                                                    onClick={() => {
                                                        if (!confirm('Disable this user?')) return;
                                                        router.delete(`/admin/users/${row.id}`, { preserveScroll: true });
                                                    }}
                                                >
                                                    Disable
                                                </Button>
                                                <Button
                                                    size="compact-sm"
                                                    variant="light"
                                                    color="gray"
                                                    radius="md"
                                                    leftSection={<RiLockPasswordLine size={14} />}
                                                    disabled={row.role === 'SUPER_ADMIN'}
                                                    onClick={() => openReset(row)}
                                                >
                                                    Reset password
                                                </Button>
                                                <Button
                                                    size="compact-sm"
                                                    variant="light"
                                                    color="red"
                                                    radius="md"
                                                    leftSection={<RiKey2Line size={14} />}
                                                    disabled={row.role === 'SUPER_ADMIN' || !row.company_id}
                                                    onClick={() => issueCode(row.id)}
                                                >
                                                    Issue code
                                                </Button>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    )}
                </TableControls>
            </Paper>
        </AdminLayout>
    );
}
