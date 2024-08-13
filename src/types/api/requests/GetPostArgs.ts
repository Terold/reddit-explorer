type Base = {
    subreddit: string | string[] | null // the name or the names of the subreddit(s)
    postId: string
    commentsOrS: string
}

export type GetPostArgs = Base
