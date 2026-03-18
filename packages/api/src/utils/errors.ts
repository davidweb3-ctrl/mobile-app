export class AppError extends Error {
    constructor(public message: string, public statusCode: number = 500, public code?: string) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class BountyNotFoundError extends AppError {
    constructor(message: string = 'Bounty not found') {
        super(message, 404, 'BOUNTY_NOT_FOUND');
    }
}

export class InvalidBountyStatusError extends AppError {
    constructor(message: string) {
        super(message, 400, 'INVALID_BOUNTY_STATUS');
    }
}

export class InvalidDeadlineError extends AppError {
    constructor(message: string) {
        super(message, 400, 'INVALID_DEADLINE');
    }
}
