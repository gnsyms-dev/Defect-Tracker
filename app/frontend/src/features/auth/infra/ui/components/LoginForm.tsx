import { Button } from '@/shared/ui/Button';
import { FormField } from '@/shared/ui/FormField';
import { fieldAria } from '@/shared/ui/field-aria';
import { TextInput } from '@/shared/ui/inputs';
import { useLoginViewModel } from '../view-models/useLoginViewModel';

export function LoginForm() {
  const { form, submit, isSubmitting, formError } = useLoginViewModel();
  const { register, formState } = form;
  const { errors } = formState;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      {formError ? (
        <p
          role="alert"
          className="rounded-control border border-critical/40 bg-critical-bg px-3 py-2 text-sm font-medium text-critical"
        >
          {formError}
        </p>
      ) : null}

      <FormField id="email" label="Email" error={errors.email?.message} isRequired>
        <TextInput
          {...register('email')}
          {...fieldAria('email', {
            hasError: Boolean(errors.email),
            hasHint: false,
          })}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="supervisor@example.com"
        />
      </FormField>

      <FormField
        id="password"
        label="Password"
        error={errors.password?.message}
        isRequired
      >
        <TextInput
          {...register('password')}
          {...fieldAria('password', {
            hasError: Boolean(errors.password),
            hasHint: false,
          })}
          type="password"
          autoComplete="current-password"
        />
      </FormField>

      <Button type="submit" size="lg" isFullWidth isLoading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
