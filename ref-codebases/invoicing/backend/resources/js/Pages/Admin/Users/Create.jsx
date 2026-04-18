import {
    Button,
    Checkbox,
    Group,
    Paper,
    PasswordInput,
    Select,
    Stack,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { Link, router, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import AdminLayout from '../../../Layouts/AdminLayout';

export default function Create({ companies }) {
    const { errors } = usePage().props;

    const form = useForm({
        initialValues: {
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
            password: '',
            password_confirmation: '',
            role: 'USER',
            company_id: '',
            is_active: true,
        },
    });

    useEffect(() => {
        if (!errors || typeof errors !== 'object') {
            return;
        }
        if (Object.keys(errors).length === 0) {
            form.clearErrors();
        } else {
            form.setErrors(errors);
        }
    }, [errors]);

    const companyData = [{ value: '', label: 'No company (yet)' }, ...(companies ?? [])];

    return (
        <AdminLayout title="Add user" description="Create a tenant user with email login. Super admin accounts cannot be created here.">
            <Paper
                component="form"
                shadow="sm"
                p="xl"
                radius="lg"
                withBorder
                maw={560}
                onSubmit={form.onSubmit((values) => {
                    router.post('/admin/users', {
                        ...values,
                        company_id: values.company_id || null,
                    });
                })}
            >
                <Title order={5} mb="lg" fw={600}>
                    User details
                </Title>
                <Stack gap="md">
                    <Group grow>
                        <TextInput label="First name" required withAsterisk {...form.getInputProps('first_name')} autoComplete="given-name" />
                        <TextInput label="Last name" required withAsterisk {...form.getInputProps('last_name')} autoComplete="family-name" />
                    </Group>
                    <TextInput label="Email" required withAsterisk type="email" {...form.getInputProps('email')} autoComplete="email" />
                    <TextInput label="Phone" {...form.getInputProps('phone')} autoComplete="tel" />
                    <Select
                        label="Role"
                        data={[
                            { value: 'USER', label: 'User' },
                            { value: 'ADMIN', label: 'Admin' },
                        ]}
                        {...form.getInputProps('role')}
                    />
                    <Select
                        label="Company"
                        description="Optional — link to an existing company."
                        data={companyData}
                        {...form.getInputProps('company_id')}
                    />
                    <PasswordInput label="Password" required withAsterisk {...form.getInputProps('password')} autoComplete="new-password" />
                    <PasswordInput
                        label="Confirm password"
                        required
                        withAsterisk
                        {...form.getInputProps('password_confirmation')}
                        autoComplete="new-password"
                    />
                    <Checkbox label="Active" {...form.getInputProps('is_active', { type: 'checkbox' })} />
                    <Group justify="space-between" mt="md">
                        <Button component={Link} href="/admin/users" variant="default" type="button">
                            Cancel
                        </Button>
                        <Button color="red" type="submit">
                            Create user
                        </Button>
                    </Group>
                </Stack>
            </Paper>
        </AdminLayout>
    );
}
