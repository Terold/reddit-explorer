import { defaultConfig } from "../config/defaultConfig"
import { Endpoint } from "../constants/Endpoint"
import { uuidv4 } from "../helpers/uuidv4"
import axios from "axios"
import { GetSubredditNamesArgs } from "../types/api/requests/GetSubredditNamesArgs"
import { GetSubredditNamesResponse } from "../types/api/responses/GetSubredditNamesResponse"
import { RedditClientConfiguration } from "../config/RedditClientConfiguration"
import { AccessTokenResponse } from "../types/api/responses/AccessTokenResponse"
import { GetSubredditArgs } from "../types/api/requests/GetSubredditArgs"
import { GetPostArgs } from "../types/api/requests/GetPostArgs"
import { GetSubredditResponse } from "../types/api/responses/GetSubredditResponse"
import { filterPosts } from "./filterPosts"
import { validateConfig } from "../config/configValidator"

export const createRedditClient = (config: RedditClientConfiguration) => {
    const finalConfig = { ...defaultConfig, ...config }

    validateConfig(finalConfig)

    const { clientId, secret, userAgent, grantType, deviceId = uuidv4(), debug, postFilters, limit } = finalConfig
    let { matureContent } = finalConfig

    const api = axios.create({
        baseURL: Endpoint.BaseUrl,
    })

    let expirationTimestampInMilliseconds = 0
    let token = ""

    api.interceptors.request.use(async (axiosRequestConfig) => {
        if (Date.now() > expirationTimestampInMilliseconds) {
            const response = await getAccessToken()
            token = response.access_token
            expirationTimestampInMilliseconds = Date.now() + response.expires_in * 1000
        }

        axiosRequestConfig.headers.Authorization = "Bearer " + token

        debug?.logToken && console.log("token", token)

        return axiosRequestConfig
    })

    /**
     * Get access token for unauthenticated user
     */
    const getAccessToken = async (): Promise<AccessTokenResponse> => {
        const params = new URLSearchParams()
        params.append("grant_type", grantType!) // TODO: fix "!"
        params.append("device_id", deviceId)

        const response = await axios.post<AccessTokenResponse>(Endpoint.AccessToken, params, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": userAgent,
            },
            auth: {
                username: clientId,
                password: secret,
            },
        })

        return response.data
    }

    const getSubreddit = async <TGetSubredditArgs extends GetSubredditArgs>(
        args: TGetSubredditArgs
    ): Promise<GetSubredditResponse<TGetSubredditArgs>> => {
        const { name, sortMethod, ...restParams } = args

        const nameParam = Array.isArray(name) ? name.join("+") : name

        const response = await api.get<GetSubredditResponse<TGetSubredditArgs>>(`/r/${nameParam}/${sortMethod}`, {
            params: { limit, ...restParams },
        })

        return filterPosts(response.data, postFilters)
    }

    const getUserMulti = async <TGetSubredditArgs extends GetSubredditArgs>(
      args: TGetSubredditArgs
  ): Promise<GetSubredditResponse<TGetSubredditArgs>> => {
      const { name, sortMethod, ...restParams } = args


      const response = await api.get<GetSubredditResponse<TGetSubredditArgs>>(`/${name}/${sortMethod}`, {
          params: { limit, ...restParams },
      })

      return filterPosts(response.data, postFilters)
  }

    async function* getSubredditIterator<TGetSubredditArgs extends GetSubredditArgs>(
        args: TGetSubredditArgs
    ): AsyncIterator<GetSubredditResponse<TGetSubredditArgs>> {
        let after: string | null = null

        while (true) {
            const res: GetSubredditResponse<TGetSubredditArgs> = await getSubreddit({
                after,
                ...args,
            })

            after = res.data.after

            yield res
        }
    }

    const getSubredditNames = async (params: GetSubredditNamesArgs): Promise<GetSubredditNamesResponse> => {
        const paramsWithConfig: GetSubredditNamesArgs = {
            include_over_18: matureContent,
            ...params,
        }

        const response = await api.get<GetSubredditNamesResponse>("/api/search_reddit_names", {
            params: paramsWithConfig,
        })

        return response.data
    }

    const conf = {
        setMatureContent: (newMatureContent: boolean) => {
            matureContent = newMatureContent
        },
    }

    const getSubredditPost = async <TGetPostArgs extends GetPostArgs>(
      args: TGetPostArgs
  ): Promise<any> => {
      const { subreddit, postId, ...restParams } = args

      const response = await api.get<any>(`/r/${subreddit}/comments/${postId}`, {
          params: { limit, ...restParams },
      })

      return filterPosts(response.data, postFilters)
  }

    return {
        finalConfig,
        getAccessToken,
        getSubreddit,
        getSubredditIterator,
        getSubredditNames,
        getSubredditPost,
        getUserMulti,
        config: conf,
    }
}
