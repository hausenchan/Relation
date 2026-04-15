import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Select, Space, Tag, List, Typography, Spin, Badge, Empty } from 'antd';
import { EnvironmentOutlined, WarningOutlined } from '@ant-design/icons';
import { personsApi } from '../api';

const { Text } = Typography;
const { Option } = Select;

// 腾讯地图 Key
const TMAP_KEY = 'BFBBZ-CNXC4-XEWUR-KQN7R-QOUGJ-Q4B66';

// 中国主要城市经纬度表
const CITY_COORDS = {
  '北京':[116.40,39.90],'上海':[121.47,31.23],'广州':[113.26,23.13],'深圳':[114.06,22.54],
  '杭州':[120.15,30.27],'成都':[104.07,30.57],'重庆':[106.55,29.56],'武汉':[114.30,30.59],
  '南京':[118.78,32.06],'西安':[108.94,34.26],'苏州':[120.62,31.30],'天津':[117.19,39.13],
  '郑州':[113.65,34.76],'长沙':[112.97,28.23],'东莞':[113.75,23.05],'青岛':[120.38,36.07],
  '合肥':[117.28,31.86],'宁波':[121.55,29.87],'佛山':[113.12,23.02],'昆明':[102.83,25.02],
  '沈阳':[123.43,41.80],'无锡':[120.31,31.57],'大连':[121.61,38.91],'济南':[117.00,36.65],
  '厦门':[118.10,24.49],'哈尔滨':[126.63,45.75],'福州':[119.30,26.08],'温州':[120.67,28.00],
  '石家庄':[114.51,38.04],'南宁':[108.32,22.82],'长春':[125.32,43.88],'泉州':[118.59,24.87],
  '贵阳':[106.71,26.65],'常州':[119.97,31.77],'珠海':[113.58,22.27],'南通':[120.86,32.06],
  '嘉兴':[120.76,30.77],'中山':[113.38,22.52],'惠州':[114.42,23.09],'太原':[112.55,37.87],
  '烟台':[121.39,37.54],'兰州':[103.83,36.06],'绍兴':[120.58,30.00],'海口':[110.35,20.02],
  '扬州':[119.41,32.39],'徐州':[117.18,34.26],'台州':[121.42,28.66],'金华':[119.65,29.08],
  '潍坊':[119.16,36.71],'保定':[115.47,38.87],'镇江':[119.45,32.20],'洛阳':[112.45,34.62],
  '呼和浩特':[111.75,40.84],'乌鲁木齐':[87.62,43.83],'银川':[106.23,38.49],'西宁':[101.78,36.62],
  '拉萨':[91.11,29.65],'三亚':[109.51,18.25],'香港':[114.17,22.32],'澳门':[113.55,22.20],
  '台北':[121.57,25.04],
};

const CITY_NAMES = Object.keys(CITY_COORDS);

const categoryMap = {
  business: { label: '商务圈', color: 'blue' },
  talent:   { label: '人才圈', color: 'green' },
  startup:  { label: '创业圈', color: 'orange' },
  social:   { label: '社交圈', color: 'purple' },
};

const weightMap = {
  core:     { label: '核心', color: '#f5222d' },
  important:{ label: '重要', color: '#fa8c16' },
  medium:   { label: '普通', color: '#1677ff' },
  low:      { label: '一般', color: '#999' },
};

const WARN_DAYS = 30;

// 动态加载腾讯地图 SDK
function loadTMapSDK() {
  return new Promise((resolve, reject) => {
    if (window.TMap) { resolve(window.TMap); return; }
    const script = document.createElement('script');
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${TMAP_KEY}`;
    script.onload = () => resolve(window.TMap);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function PersonsMap() {
  const [filterCity, setFilterCity] = useState([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterWeight, setFilterWeight] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  // 初始化腾讯地图
  useEffect(() => {
    loadTMapSDK().then(TMap => {
      const map = new TMap.Map(mapRef.current, {
        center: new TMap.LatLng(35.5, 104.0),
        zoom: 5,
        viewMode: '2D',
      });
      mapInstanceRef.current = map;
      infoWindowRef.current = new TMap.InfoWindow({ map, enableCustom: true, offset: { x: 0, y: -20 } });
      infoWindowRef.current.close();
      setMapReady(true);
    }).catch(() => {});

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (filterCity.length > 0) params.city = filterCity.join(',');
    if (filterCategory) params.person_category = filterCategory;
    if (filterWeight) params.weight = filterWeight;
    try {
      const res = await personsApi.mapData(params);
      setData(res);
    } catch {
      setData([]);
    }
    setLoading(false);
  }, [filterCity, filterCategory, filterWeight]);

  useEffect(() => { loadData(); }, [loadData]);

  // 按城市分组
  const cityGroups = useMemo(() => {
    const groups = {};
    data.forEach(p => {
      const cities = (p.city || '').split(',').map(s => s.trim()).filter(Boolean);
      cities.forEach(c => {
        if (!groups[c]) groups[c] = [];
        groups[c].push(p);
      });
    });
    return groups;
  }, [data]);

  // 有坐标的城市标点
  const mapPoints = useMemo(() => {
    return Object.entries(cityGroups)
      .filter(([city]) => CITY_COORDS[city])
      .map(([city, persons]) => {
        const [lng, lat] = CITY_COORDS[city];
        const hasWarning = persons.some(p => p.days_since_contact === null || p.days_since_contact >= WARN_DAYS);
        return { city, persons, lat, lng, hasWarning, count: persons.length };
      });
  }, [cityGroups]);

  // 更新标点
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.TMap) return;
    const TMap = window.TMap;
    const map = mapInstanceRef.current;

    // 清除旧标点
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    if (mapPoints.length === 0) return;

    const markers = [];
    mapPoints.forEach(pt => {
      const size = Math.min(28 + pt.count * 4, 52);
      const bgColor = pt.hasWarning ? '#ff4d4f' : '#1677ff';

      const marker = new TMap.DOMOverlay({
        map,
        position: new TMap.LatLng(pt.lat, pt.lng),
      });

      // 用 MultiMarker + Label 代替 DOMOverlay
      // 腾讯地图推荐用 MultiMarker
    });

    // 使用 MultiMarker 方式
    const geometries = mapPoints.map((pt, idx) => ({
      id: `marker_${idx}`,
      position: new TMap.LatLng(pt.lat, pt.lng),
      properties: pt,
    }));

    const markerCluster = new TMap.MultiMarker({
      map,
      styles: mapPoints.reduce((acc, pt, idx) => {
        const size = Math.min(28 + pt.count * 4, 52);
        const bgColor = pt.hasWarning ? '#ff4d4f' : '#1677ff';
        acc[`marker_${idx}`] = new TMap.MarkerStyle({
          width: size,
          height: size,
          anchor: { x: size / 2, y: size / 2 },
          src: `data:image/svg+xml,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
              <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${bgColor}" stroke="white" stroke-width="2"/>
              <text x="${size/2}" y="${size/2 + 5}" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${pt.count}</text>
            </svg>
          `)}`,
        });
        return acc;
      }, {}),
      geometries: geometries.map((g, idx) => ({ ...g, styleId: `marker_${idx}` })),
    });

    // 点击弹出信息窗
    markerCluster.on('click', (e) => {
      const pt = e.geometry.properties;
      const content = `
        <div style="background:#fff;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:12px 16px;min-width:200px;max-width:320px;">
          <div style="font-weight:700;font-size:15px;margin-bottom:8px;border-bottom:1px solid #f0f0f0;padding-bottom:6px;color:#333;">
            📍 ${pt.city}（${pt.count}人）
          </div>
          ${pt.persons.map(p => {
            const warn = p.days_since_contact === null || p.days_since_contact >= WARN_DAYS;
            const daysText = p.days_since_contact !== null ? `${p.days_since_contact}天前` : '暂无互动';
            return `<div style="padding:4px 0;border-bottom:1px solid #fafafa;">
              <div style="font-weight:600;font-size:13px;color:${warn ? '#ff4d4f' : '#333'};">${p.name}${p.company ? ` · ${p.company}` : ''}</div>
              <div style="font-size:11px;color:${warn ? '#ff4d4f' : '#999'};">
                上次联系：${daysText}${warn ? ' ⚠️' : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      `;
      infoWindowRef.current.open();
      infoWindowRef.current.setPosition(e.geometry.position);
      infoWindowRef.current.setContent(content);
    });

    markersRef.current = [markerCluster];

    // 自适应视野
    if (mapPoints.length === 1) {
      map.setCenter(new TMap.LatLng(mapPoints[0].lat, mapPoints[0].lng));
      map.setZoom(10);
    } else {
      const bounds = new TMap.LatLngBounds();
      mapPoints.forEach(pt => bounds.extend(new TMap.LatLng(pt.lat, pt.lng)));
      map.fitBounds(bounds, { padding: 60 });
    }
  }, [mapPoints, mapReady]);

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 260px)', minHeight: 500 }}>
      {/* 左侧：筛选 + 列表 */}
      <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }} size={8}>
          <Select
            mode="multiple"
            placeholder="选择城市"
            allowClear
            style={{ width: '100%' }}
            value={filterCity}
            onChange={setFilterCity}
            filterOption={(input, option) =>
              option.children.toLowerCase().includes(input.toLowerCase())
            }
            maxTagCount={3}
          >
            {CITY_NAMES.map(c => <Option key={c} value={c}>{c}</Option>)}
          </Select>
          <Space>
            <Select
              placeholder="圈子"
              allowClear
              style={{ width: 100 }}
              value={filterCategory || undefined}
              onChange={v => setFilterCategory(v || '')}
            >
              {Object.entries(categoryMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
            <Select
              placeholder="权重"
              allowClear
              style={{ width: 100 }}
              value={filterWeight || undefined}
              onChange={v => setFilterWeight(v || '')}
            >
              {Object.entries(weightMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
            </Select>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <EnvironmentOutlined /> 共 {data.length} 位人脉，分布在 {Object.keys(cityGroups).length} 个城市
          </Text>
        </Space>

        <Spin spinning={loading}>
          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
            {Object.keys(cityGroups).length === 0 ? (
              <Empty description="暂无数据" style={{ marginTop: 40 }} />
            ) : (
              Object.entries(cityGroups).map(([city, persons]) => (
                <div key={city} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#333' }}>
                    <EnvironmentOutlined style={{ color: '#1677ff', marginRight: 4 }} />
                    {city}
                    <Badge count={persons.length} style={{ marginLeft: 6, backgroundColor: '#1677ff' }} size="small" />
                    {!CITY_COORDS[city] && <Tag color="orange" style={{ marginLeft: 4, fontSize: 10 }}>无坐标</Tag>}
                  </div>
                  <List
                    size="small"
                    dataSource={persons}
                    renderItem={p => {
                      const warn = p.days_since_contact === null || p.days_since_contact >= WARN_DAYS;
                      return (
                        <List.Item style={{ padding: '4px 8px', borderBottom: '1px solid #fafafa' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13 }}>
                              <Text strong>{p.name}</Text>
                              {p.company && <Text type="secondary" style={{ fontSize: 12 }}> · {p.company}</Text>}
                            </div>
                            <div style={{ fontSize: 11 }}>
                              {warn ? (
                                <Text type="danger">
                                  <WarningOutlined /> {p.days_since_contact !== null ? `${p.days_since_contact}天未联系` : '暂无互动'}
                                </Text>
                              ) : (
                                <Text type="secondary">{p.days_since_contact}天前联系</Text>
                              )}
                              {p.weight && weightMap[p.weight] && (
                                <Tag color={weightMap[p.weight].color} style={{ fontSize: 10, lineHeight: '16px', marginLeft: 4 }}>
                                  {weightMap[p.weight].label}
                                </Tag>
                              )}
                            </div>
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </Spin>
      </div>

      {/* 右侧：腾讯地图 */}
      <div style={{ flex: 1, borderRadius: 8, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
