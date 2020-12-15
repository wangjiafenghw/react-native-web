import * as React from 'react';
import ReactDOM from 'react-dom';
import BetterScroll from 'better-scroll';
import { View, StyleSheet, RefreshControl } from 'react-native';

const TRUE = true,
  FALSE = false,
  NativeEvent = {
    contentOffset: {},
    contentSize: {},
    layoutMeasurement: {}
  },
  DEFAULT_ON_EndReachedThreshold = 0.01,
  DEFAULT_ANIMATED_TIME = 300; // ms

export default class extends React.Component {
  constructor(props) {
    super(props);
    this.bs = null; // 滚动容器ref
    this.bottomFlag = null; // 滚动容器内容区域最底部标记元素，用于实现scrollToEnd
    this.bsOptions = this.transPropsToBSAttr(props); // 滚动对象配置
    this.contentSize = { height: 0, width: 0 }; // 内容尺寸
    this._cachePosition = { x: 0, y: 0 }; // 缓存滚动数据
    this.canLoadMore = TRUE; // 是否开放加载更多，会不重写
    this.onEndReachedThreshold = props.onEndReachedThreshold || DEFAULT_ON_EndReachedThreshold;
  }

  /**
   * 将组件属性通过一定转换规则赋予bs容器属性
   * @param {*} props 组件属性
   */
  transPropsToBSAttr = props => {
    return {
      scrollY: !props.horizontal,
      scrollX: props.horizontal,
      scrollbar:
        (props.horizontal && props.showsHorizontalScrollIndicator) ||
        (!props.horizontal && props.showsVerticalScrollIndicator),
      pullDownRefresh: props.refreshControl,
      movable: TRUE,
      bounces: props.bounces, // 看上去并不好使
      zoom: props.bouncesZoom,
      pullUpLoad: TRUE,
      click: TRUE
    };
  };

  refreshContentSize = timeout => {
    try {
      setTimeout(() => {
        const contentDom = ReactDOM.findDOMNode(this.contentWrapRef);
        const { offsetWidth, offsetHeight } = contentDom || {};
        // 重置加载更多可用
        if (!this.canLoadMore && offsetHeight !== this.contentSize.height) {
          this.canLoadMore = true;
        }
        this.contentSize = {
          height: offsetHeight,
          width: offsetWidth
        };
      }, timeout || 0);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('获取滚动内容尺寸失败', error);
      }
    }
  };

  normalizeScrollEvent = (position = {}) => {
    const _position = {};
    /*******
     * 由于better-scroll组件提供的事件监听的回调入参在在Start类方法中没有传入滚动的位置信息
     * ! 这里会在任何滚动相关回调发生时触发，关注性能，理论上统一放到End的hook中也是可以的
     * 1. 如果position入参传入空对象或undefined，命中②，④逻辑，读取组件缓存到属性中的位置数据
     * 2. 如果传入数值走①、③逻辑，写入返回值并更新缓存数据
     * 3. ⑤是安全代码，正常流程不会走到
     *  */

    if (typeof position.x === 'number') {
      //! ①
      _position.x = position.x;
      this._cachePosition.x = position.x;
    } else {
      //! ②
      _position.x = this._cachePosition.x;
    }
    if (typeof position.y === 'number') {
      //! ③
      _position.y = position.y;
      this._cachePosition.y = position.y;
    } else {
      //! ④
      _position.y = this._cachePosition.y;
    }
    return {
      nativeEvent: {
        ...NativeEvent,
        contentOffset: {
          x: -_position.x / window.__rate_U || 0, //! ⑤
          y: -_position.y / window.__rate_U || 0
        },
        contentSize: this.contentSize
      },
      timestamp: Date.now()
    };
  };

  /**
   * 统一处理组件属性的来源
   * @param {*} newProps 可以是任意来源的props类型属性对象
   */
  handlePropsChangeToBSAttr = newProps => {
    this.transPropsToBSAttr(newProps);
  };

  /**
   * ref function handle
   * Example: scrollTo({x: 0, y: 0, animated: true})
   */
  scrollTo = options => {
    const { horizontal } = this.props;
    const _options = {
      x: 0,
      y: 0,
      animated: TRUE
    };
    if (typeof options === 'number') {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '不赞成使用数字参数处理，建议使用对象参数',
          'https://reactnative.dev/docs/0.61/scrollview#scrollto'
        );
      }
      _options[horizontal ? 'x' : 'y'] = -options;
    } else if (typeof options === 'object') {
      _options.x = options.x && horizontal ? -options.x : 0;
      _options.y = options.y && !horizontal ? -options.y : 0;
      _options.time = options.animated === FALSE ? 0 : DEFAULT_ANIMATED_TIME;
    } else {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('参数不合法');
      }
      return;
    }
    this.bs &&
      this.bs.scrollTo(_options.x * window.__rate_U, _options.y * window.__rate_U, _options.time);
  };

  scrollToEnd = ({ animated = TRUE, duration = DEFAULT_ANIMATED_TIME } = {}) => {
    let time = duration;
    if (!animated) {
      time = 0;
    }
    try {
      const bottomFlagDom = ReactDOM.findDOMNode(this.bottomFlag);
      this.bs && this.bs.scrollToElement(bottomFlagDom, time);
    } catch (err) {}
  };

  componentDidMount() {
    setTimeout(() => {
      this.bs = new BetterScroll(ReactDOM.findDOMNode(this.wrapper), {
        ...this.bsOptions
      });

      this.refreshContentSize(100);

      const {
        refreshControl,
        onScroll,
        scrollEnabled = TRUE,
        onEndReached,
        onScrollBeginDrag,
        onMomentumScrollBegin,
        onScrollEndDrag,
        onMomentumScrollEnd
      } = this.props;

      this.bs.enabled = scrollEnabled;

      /**
       * hooks
       */
      const hooks = this.bs.scroller.hooks;
      hooks.on('scrollEnd', position => {
        onMomentumScrollEnd && onMomentumScrollEnd(this.normalizeScrollEvent(position));
      });
      const hooksActions = this.bs.scroller.actions.hooks;
      hooksActions.on('end', (e, position) => {
        onScrollEndDrag && onScrollEndDrag(this.normalizeScrollEvent(position));
      });

      /**
       * callback
       */
      // this.bs.on("pullingDown", () => {
      //     this.canLoadMore = true;
      //     refreshControl.props?.onRefresh();
      // });
      this.bs.on('scrollStart', () => {
        onScrollBeginDrag && onScrollBeginDrag(this.normalizeScrollEvent({}));
        onMomentumScrollBegin && onMomentumScrollBegin(this.normalizeScrollEvent({}));
      });

      this.bs.on('scroll', position => {
        const callbackValue = this.normalizeScrollEvent(position);
        const { contentOffset = {}, contentSize = {} } = callbackValue.nativeEvent;
        if (
          this.canLoadMore &&
          contentOffset.y + window.innerHeight >=
            contentSize.height * (1 - this.onEndReachedThreshold)
        ) {
          this.canLoadMore = false;
          onEndReached && onEndReached();
        }
        onScroll && onScroll(callbackValue);
      });
      // this.bs.on("pullingUp", () => {
      //     onEndReached && onEndReached();
      //     this.bs.finishPullUp();
      // });
    }, 0);
  }

  componentWillUnmount() {
    this.bs && this.bs.destroy();
  }

  componentWillReceiveProps(nextProps) {
    const { refreshing: nextRefreshing } = nextProps?.props || {};
    const { refreshing: thisRefreshing } = this.props?.props || {};
    const { refreshing: refreshControlNextRefreshing } = nextProps?.refreshControl?.props || {};
    const { refreshing: refreshControlThisRefreshing } = this.props.refreshControl?.props || {};
    // 根据RefreshControl的refreshing属性值变化判断下拉刷新停止时机
    if (
      (thisRefreshing && nextRefreshing !== thisRefreshing) ||
      (refreshControlThisRefreshing &&
        refreshControlNextRefreshing !== refreshControlThisRefreshing)
    ) {
      this.bs && this.bs.finishPullDown();
    }
    if (
      (!thisRefreshing && nextRefreshing !== thisRefreshing) ||
      (!refreshControlThisRefreshing &&
        refreshControlNextRefreshing !== refreshControlThisRefreshing)
    ) {
      this.bs && this.bs.autoPullDownRefresh();
    }
  }

  componentDidUpdate(prevProps) {
    const {
      children,
      scrollEnabled = TRUE
      // bouncesZoom = FALSE,
    } = this.props;

    // 这里注意性能消耗 fix me
    if (prevProps.children !== children) {
      this.refreshContentSize();
      this.bs && this.bs.refresh();
    }
    // better-scroll zoom属性暂时不支持动态使能
    // if(prevProps.bouncesZoom !== bouncesZoom){
    //     this.bsOptions = this.handlePropsChangeToBSAttr(this.props)
    //     this.bs.refresh()
    // }
    if (prevProps.scrollEnabled !== scrollEnabled) {
      if (this.bs) {
        this.bs.enabled = scrollEnabled;
      }
    }
  }

  render() {
    const { children, refreshControl, horizontal } = this.props;
    return (
      <View style={[styles.container, this.props.style]} ref={o => (this.wrapper = o)}>
        {horizontal ? (
          <View style={{ display: 'inline-block', height: '100%' }}>{children}</View>
        ) : (
          <View
            style={{
              display: 'inline-block',
              whiteSpace: 'nowrap',
              width: '100%'
            }}
          >
            <View style={styles.refreshTip}>{refreshControl}</View>
            <View
              style={{
                display: 'inline-block',
                whiteSpace: 'nowrap',
                width: '100%'
              }}
              ref={o => (this.contentWrapRef = o)}
            >
              {children}
            </View>
            <View
              style={{
                height: 0,
                width: 0,
                backgroundColor: 'transparent',
                opacity: 0,
                zIndex: -1
              }}
              ref={o => (this.bottomFlag = o)}
            />
          </View>
        )}
      </View>
    );
  }
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    display: 'inline-block',
    overflow: 'hidden',
    whiteSpace: 'nowrap'
  },
  refreshTip: {
    bottom: '100%',
    height: 30,
    lineHeight: 30,
    width: '100%',
    textAlign: 'center',
    position: 'absolute',
    left: 0,
    overflow: 'hidden'
  }
});
