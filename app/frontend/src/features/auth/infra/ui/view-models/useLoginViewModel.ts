import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toUserMessage } from '@/shared/api/errors';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { loginSchema, type LoginFormValues } from '../../../application/validators/login.schema';
import { useAuth } from '../../di/useAuth';

export interface LoginViewModel {
  readonly form: ReturnType<typeof useForm<LoginFormValues>>;
  readonly submit: () => void;
  readonly isSubmitting: boolean;
  /** Form-level message. Server errors cannot be mapped to fields -- see below. */
  readonly formError: string | null;
}

/**
 * The component renders; this orchestrates. Per the project's SOLID guidance, data
 * access and submission logic live in a view-model hook rather than in the component.
 */
export function useLoginViewModel(): LoginViewModel {
  const { login } = useAuth();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    // onTouched, not onChange: validating every keystroke on a phone keyboard shows
    // "invalid email" while the user is still halfway through typing one.
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  const action = useAsyncAction(async (values: LoginFormValues) => {
    await login({ email: values.email.trim().toLowerCase(), password: values.password });
  });

  const submit = form.handleSubmit(async (values) => {
    await action.run(values);
  });

  return {
    form,
    submit: () => void submit(),
    isSubmitting: action.isRunning,
    // Rendered as a banner rather than under a field, because the API's exception
    // filter comma-joins validation messages into one string -- there is genuinely no
    // per-field structure to map back onto the inputs.
    formError: action.error ? toUserMessage(action.error) : null,
  };
}
