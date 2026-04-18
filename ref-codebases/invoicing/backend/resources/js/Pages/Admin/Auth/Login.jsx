import { Button, Checkbox, Paper, PasswordInput, Stack, Text, TextInput, Title, Box } from '@mantine/core';
import { useForm } from '@mantine/form';
import { router, usePage } from '@inertiajs/react';
import classes from './Login.module.css';

export default function Login() {
    const { errors } = usePage().props;
    const form = useForm({
        initialValues: {
            email: '',
            password: '',
            remember: false,
        },
    });

    const submit = (values) => {
        router.post('/admin/login', values);
    };

    return (
        <Box
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'stretch',
                background: 'var(--mantine-color-body)',
            }}
        >
            <Box
                visibleFrom="md"
                className={classes.gradientPanel}
                style={{
                    flex: 1,
                    color: 'white',
                    padding: '3rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                }}
            >
                <Title order={2} mb="md" className={classes.heroTitle}>
                    E-Invoicing Admin
                </Title>
                <Text size="lg" opacity={0.92} className={classes.heroSubtitle}>
                    Super admin workspace — overview of companies, users, invoices, and system configuration.
                </Text>
            </Box>
            <Box
                className={classes.formColumn}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
            >
                <Paper shadow="md" p="xl" radius="md" maw={420} w="100%">
                    <Title order={3} mb="xs">
                        Welcome back
                    </Title>
                    <Text size="sm" c="dimmed" mb="lg">
                        Sign in with a SUPER_ADMIN account.
                    </Text>
                    <form onSubmit={form.onSubmit(submit)}>
                        <Stack>
                            <TextInput label="Email" type="email" required {...form.getInputProps('email')} error={errors?.email} autoComplete="username" />
                            <PasswordInput label="Password" required {...form.getInputProps('password')} error={errors?.password} autoComplete="current-password" />
                            <Checkbox label="Keep me signed in" {...form.getInputProps('remember', { type: 'checkbox' })} />
                            <Button type="submit" fullWidth color="red">
                                Sign in
                            </Button>
                        </Stack>
                    </form>
                </Paper>
            </Box>
        </Box>
    );
}
