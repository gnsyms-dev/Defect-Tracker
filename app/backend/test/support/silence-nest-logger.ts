import { Logger } from '@nestjs/common';

// Unit specs instantiate providers directly, so every logger call inside them
// would otherwise print through Nest's default console logger and bury the jest
// reporter's own output. Silenced globally here rather than mocked per spec --
// no test asserts on log output, and a spec that ever needs to can re-enable it
// locally with Logger.overrideLogger(...).
Logger.overrideLogger(false);
