// utils/eventBus.ts
type EventMap = {
    'onMemoContentChange': void;
    // 在此处继续追加业务事件与参数类型
};

type EventKey = keyof EventMap;
type EventCallback<T extends EventKey> = (payload: EventMap[T]) => void;

class MiniEventBus {
    private listeners: {
        [K in EventKey]?: Array<EventCallback<K>>;
    } = {};

    /** 订阅事件 */
    on<K extends EventKey>(event: K, fn: EventCallback<K>) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(fn);
    }

    /** 一次性订阅 */
    once<K extends EventKey>(event: K, fn: EventCallback<K>) {
        const wrapper: EventCallback<K> = (p) => {
            fn(p);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }

    /** 取消订阅（不传 fn 则清空该事件全部回调） */
    off<K extends EventKey>(event: K, fn?: EventCallback<K>) {
        if (!fn) {
            delete this.listeners[event];
            return;
        }
        const list = this.listeners[event];
        if (!list) return;
        const idx = list.indexOf(fn);
        if (idx > -1) list.splice(idx, 1);
    }

    /** 触发事件 */
    emit<K extends EventKey>(event: K, payload: EventMap[K]) {
        (this.listeners[event] || []).forEach(cb => cb(payload));
    }
}

/** 全局单例 */
export const eventBus = new MiniEventBus();