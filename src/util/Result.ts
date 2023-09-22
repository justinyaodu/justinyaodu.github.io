type Ok<T> = { ok: true; value: T };
type Err<E> = { ok: false; error: E };

type Result<T, E> = Ok<T> | Err<E>;

const Result = {
  ok<T>(value: T): Ok<T> {
    return { ok: true, value };
  },

  err<E>(error: E): Err<E> {
    return { ok: false, error };
  },

  fromThrowing<T>(func: () => T): Result<T, unknown> {
    try {
      return Result.ok(func());
    } catch (e) {
      return Result.err(e);
    }
  },
};

export { Result };
