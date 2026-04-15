import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Select, Space, Tag, List, Typography, Spin, Badge, Empty } from 'antd';
import { EnvironmentOutlined, WarningOutlined } from '@ant-design/icons';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { personsApi } from '../api';

const { Text } = Typography;
const { Option } = Select;

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

// 自适应视野组件
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 10);
      } else {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }, [bounds, map]);
  return null;
}

export default function PersonsMap() {
  const [filterCity, setFilterCity] = useState([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterWeight, setFilterWeight] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

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

  const bounds = useMemo(() => mapPoints.map(p => [p.lat, p.lng]), [mapPoints]);

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

      {/* 右侧：地图 */}
      <div style={{ flex: 1, borderRadius: 8, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
        <MapContainer
          center={[35.5, 104.0]}
          zoom={5}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {bounds.length > 0 && <FitBounds bounds={bounds} />}
          {mapPoints.map(pt => {
            const radius = Math.min(10 + pt.count * 3, 28);
            return (
              <CircleMarker
                key={pt.city}
                center={[pt.lat, pt.lng]}
                radius={radius}
                pathOptions={{
                  color: '#fff',
                  weight: 2,
                  fillColor: pt.hasWarning ? '#ff4d4f' : '#1677ff',
                  fillOpacity: 0.85,
                }}
              >
                <Popup maxWidth={320}>
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, borderBottom: '1px solid #f0f0f0', paddingBottom: 4 }}>
                      {pt.city}（{pt.count}人）
                    </div>
                    {pt.persons.map(p => {
                      const warn = p.days_since_contact === null || p.days_since_contact >= WARN_DAYS;
                      const daysText = p.days_since_contact !== null ? `${p.days_since_contact}天前` : '暂无互动';
                      return (
                        <div key={p.id} style={{ padding: '3px 0', borderBottom: '1px solid #fafafa', color: warn ? '#ff4d4f' : undefined }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}{p.company ? ` · ${p.company}` : ''}</div>
                          <div style={{ fontSize: 11, color: warn ? '#ff4d4f' : '#999' }}>
                            上次联系：{daysText}{warn ? ' !!!' : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
